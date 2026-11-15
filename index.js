require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("./models/user");
const Service = require("./models/service");
const ImageCleanup = require("./models/ImageCleanup");
const auth = require("./middleware/auth");
const cors = require("cors");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const app = express();
const port = process.env.PORT || 3000;


app.use(cors({
    origin:process.env.FRONTEND_URL || "http://127.0.0.1:5000"
}));

app.use(express.json());

// dont forget to run 
// npm init -y
// npm install express mongoose bcryptjs jsonwebtoken dotenv cors 
// npm install multer cloudinary {for images}
// npm i -D nodemon (other development based packages)
// nodemon run dev
// and test in postman if everything is running well.



if (!process.env.JWT_SECRET || !process.env.MONGO_URI) {
    throw new Error("Set JWT_SECRET and MONGO_URI in .env");
}


/*=======================================
    for image storage and use
=======================================*/



cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});




const uploadImage = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, callback) => {
        if (file.mimetype.startsWith("image/")) {
            callback(null, true);
        } else {
            callback(new Error("Only image files are allowed"));
        }
    }
});

function uploadToCloudinary(fileBuffer) {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder: "service-images",
                resource_type: "image"
            },
            (error, result) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(result);
                }
            }
        );

        stream.end(fileBuffer);
    });
}


/*=======================================
    User Register, login and changing info 
=======================================*/



app.post("/register", async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (
            typeof name !== "string" ||
            !name.trim() ||
            typeof email !== "string" ||
            !email.trim() ||
            typeof password !== "string" ||
            password.length < 8
        ) {
            return res.status(400).json({
                message:
                    "Name, email, and password (at least 8 characters) are required",
            });
        }
        const normalizedEmail = email.trim().toLowerCase();
        const existing = await User.findOne({ email: normalizedEmail });
        if (existing) {
            return res
                .status(409)
                .json({ message: "An account with this email already exists" });
        }
        const hash = await bcrypt.hash(password, 10);
        const user = await User.create({
            name: name.trim(),
            email: normalizedEmail,
            password: hash,
        });
        return res.status(201).json({
            message: "Registration successful",
            user: { id: user._id, name: user.name, email: user.email },
        });
    } catch (err) {
        if (err.code === 11000) {
            return res
                .status(409)
                .json({ message: "An account with this email already exists" });
        }
        console.error("Register error:", err.message);
        return res.status(500).json({ message: "Server error" });
    }
});

app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        if (typeof email !== "string" || typeof password !== "string") {
            return res
                .status(400)
                .json({ message: "Email and password are required" });
        }
        const user = await User.findOne({
            email: email.trim().toLowerCase(),
        }).select("+password");
        if (!user) {
            return res.status(401).json({ message: "Invalid email or password" });
        }
        const matches = await bcrypt.compare(password, user.password);
        if (!matches) {
            return res.status(401).json({ message: "Invalid email or password" });
        }
        const token = jwt.sign(
            {
                id: user._id.toString(),
                tokenVersion: user.tokenVersion,
            },
            process.env.JWT_SECRET,
            { expiresIn: "1h" }
        );
        return res.json({ message: "Login successful", token });
    } catch (err) {
        console.error("Login error:", err.message);
        return res.status(500).json({ message: "Server error" });
    }
});

app.get("/me", auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select("-password");
        if (!user) return res.status(404).json({ message: "User not found" });
        return res.json({
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                createdAt: user.createdAt,
            },
        });
    } catch (err) {
        console.error("Profile error:", err.message);
        return res.status(500).json({ message: "Server error" });
    }
});

app.patch("/me/change/username", auth, async (req, res) => {
    try {
        const { name } = req.body;

        if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 80) {
            return res.status(400).json({
                message: "Name must be between 2 and 80 characters",
            });
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const newName = name.trim();

        const existing = await User.findOne({
            name: newName,
            _id: { $ne: req.user.id },
        });

        if (existing) {
            return res.status(409).json({ message: "That username is already taken" });
        }

        user.name = newName;
        await user.save();

        return res.json({
            message: "Name updated successfully",
            user: { id: user._id, name: user.name, email: user.email },
        });
    } catch (err) {
        console.error("Name update error:", err.message);
        return res.status(500).json({ message: "Server error" });
    }
});

app.patch("/me/change/password", auth, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (
            typeof currentPassword !== "string" ||
            typeof newPassword !== "string" ||
            newPassword.length < 8
        ) {
            return res.status(400).json({
                message: "Current password and a new password of at least 8 characters are required",
            });
        }

        const user = await User.findById(req.user.id).select("+password");
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const matches = await bcrypt.compare(currentPassword, user.password);
        if (!matches) {
            return res.status(401).json({ message: "Current password is incorrect" });
        }

        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();

        return res.json({ message: "Password updated successfully" });
    } catch (err) {
        console.error("Password update error:", err.message);
        return res.status(500).json({ message: "Server error" });
    }
});


/*=======================================
    Account Logout and deletetion
=======================================*/


app.post("/logout", auth, async (req, res) => {
    try {
        await User.updateOne(
            { _id: req.user.id },
            { $inc: { tokenVersion: 1 } }
        );

        return res.json({ message: "Logged out successfully" });
    } catch (err) {
        console.error("Logout error:", err.message);
        return res.status(500).json({ message: "Server error" });
    }
});

app.delete("/me", auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const services = await Service.find({ owner: user._id })
            .select("imagePublicId")
            .lean();

        const publicIds = [
            ...new Set(
                services
                    .map((service) => service.imagePublicId)
                    .filter(Boolean)
            ),
        ];

        const failedImages = [];

        for (const publicId of publicIds) {
            try {
                const result = await cloudinary.uploader.destroy(publicId, {
                    resource_type: "image",
                });

                // Cloudinary can return "error" without throwing.
                if (result.result !== "ok" && result.result !== "not found") {
                    failedImages.push({
                        publicId,
                        lastError: `Cloudinary result: ${result.result}`,
                    });
                }
            } catch (err) {
                failedImages.push({
                    publicId,
                    lastError: err.message || "Cloudinary deletion failed",
                });
            }
        }

        // Save retry records before deleting the service records and account.
        if (failedImages.length > 0) {
            await ImageCleanup.bulkWrite(
                failedImages.map(({ publicId, lastError }) => ({
                    updateOne: {
                        filter: { publicId },
                        update: {
                            $set: { lastError },
                            $setOnInsert: { publicId },
                            $inc: { attempts: 1 },
                        },
                        upsert: true,
                    },
                }))
            );
        }

        await Service.deleteMany({ owner: user._id });
        await user.deleteOne();

        return res.json({
            message: "Account and services deleted",
            imagesPendingCleanup: failedImages.length,
        });
    } catch (err) {
        console.error("Account deletion error:", err.message);
        return res.status(500).json({ message: "Server error" });
    }
});


async function queueImageCleanup(publicId, errorMessage) {
    if (!publicId) return;

    await ImageCleanup.updateOne(
        { publicId },
        {
            $set: { lastError: errorMessage || "Cloudinary deletion failed" },
            $setOnInsert: { publicId },
            $inc: { attempts: 1 },
        },
        { upsert: true }
    );
}

async function retryImageCleanup() {
    const pending = await ImageCleanup.find().limit(100);

    for (const item of pending) {
        try {
            const result = await cloudinary.uploader.destroy(item.publicId, {
                resource_type: "image",
            });

            if (result.result === "ok" || result.result === "not found") {
                await item.deleteOne();
            } else {
                await ImageCleanup.updateOne(
                    { _id: item._id },
                    {
                        $inc: { attempts: 1 },
                        $set: { lastError: `Cloudinary result: ${result.result}` },
                    }
                );
            }
        } catch (err) {
            await ImageCleanup.updateOne(
                { _id: item._id },
                {
                    $inc: { attempts: 1 },
                    $set: { lastError: err.message || "Cloudinary deletion failed" },
                }
            );
        }
    }
}


/*=======================================
    Services
=======================================*/

app.get("/services", async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
        const skip = (page - 1) * limit;

        const search =
            typeof req.query.search === "string" ? req.query.search.trim() : "";

        const location =
            typeof req.query.location === "string" ? req.query.location.trim() : "";

        const category =
            typeof req.query.category === "string" ? req.query.category.trim() : "";

        const conditions = [];

        if (search) {
            const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

            conditions.push({
                $or: [
                    { name: { $regex: escapedSearch, $options: "i" } },
                    { description: { $regex: escapedSearch, $options: "i" } },
                    { category: { $regex: escapedSearch, $options: "i" } },
                    { location: { $regex: escapedSearch, $options: "i" } },
                ],
            });
        }

        if (location) {
            const escapedLocation = location.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

            conditions.push({
                location: { $regex: escapedLocation, $options: "i" },
            });
        }

        if (category) {
            const escapedCategory = category.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

            conditions.push({
                category: { $regex: `^${escapedCategory}$`, $options: "i" },
            });
        }

        const filter = conditions.length ? { $and: conditions } : {};

        const [services, total] = await Promise.all([
            Service.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate("owner", "name email"),
            Service.countDocuments(filter),
        ]);

        return res.json({
            services,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
            },
        });
    } catch (err) {
        console.error("Get services error:", err.message);
        return res.status(500).json({ message: "Server error" });
    }
});

app.get("/services/:id", async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ message: "Invalid service ID" });
        }

        const service = await Service.findById(req.params.id)
            .populate("owner", "name email");

        if (!service) {
            return res.status(404).json({ message: "Service not found" });
        }

        return res.json({ service });
    } catch (err) {
        console.error("Get service error:", err.message);
        return res.status(500).json({ message: "Server error" });
    }
});

app.get("/me/services", auth, async (req, res) => {
    try {
        const services = await Service.find({ owner: req.user.id })
            .sort({ createdAt: -1 })
            .populate("owner", "name email");

        return res.json({ services });
    } catch (err) {
        console.error("Get my services error:", err.message);
        return res.status(500).json({ message: "Server error" });
    }
});


/*=======================================
    Fvourite Services
=======================================*/


// List the signed-in user's favorites
app.get("/me/favorites", auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id)
            .select("favorites")
            .populate({
                path: "favorites",
                populate: { path: "owner", select: "name email" },
            });

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        return res.json({ favorites: user.favorites });
    } catch (err) {
        console.error("Get favorites error:", err.message);
        return res.status(500).json({ message: "Server error" });
    }
});

// Add a service to favorites
app.post("/me/favorites/:serviceId", auth, async (req, res) => {
    try {
        const { serviceId } = req.params;

        if (!mongoose.isValidObjectId(serviceId)) {
            return res.status(400).json({ message: "Invalid service ID" });
        }

        const [user, service] = await Promise.all([
            User.findById(req.user.id),
            Service.findById(serviceId),
        ]);

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        if (!service) {
            return res.status(404).json({ message: "Service not found" });
        }

        const alreadyFavorite = user.favorites.some(
            (id) => id.toString() === serviceId
        );

        if (!alreadyFavorite) {
            user.favorites.push(service._id);
            await user.save();
        }

        return res.json({ message: "Added to favorites" });
    } catch (err) {
        console.error("Add favorite error:", err.message);
        return res.status(500).json({ message: "Server error" });
    }
});

// Remove a service from favorites
app.delete("/me/favorites/:serviceId", auth, async (req, res) => {
    try {
        const { serviceId } = req.params;

        if (!mongoose.isValidObjectId(serviceId)) {
            return res.status(400).json({ message: "Invalid service ID" });
        }

        const user = await User.findById(req.user.id).select("favorites");

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        user.favorites = user.favorites.filter(
            (id) => id.toString() !== serviceId
        );
        await user.save();

        return res.json({ message: "Removed from favorites" });
    } catch (err) {
        console.error("Remove favorite error:", err.message);
        return res.status(500).json({ message: "Server error" });
    }
});

/*=======================================
    Adding Services 
=======================================*/

const SERVICE_CATEGORIES = [
    "Home Services",
    "Cleaning",
    "Repairs & Maintenance",
    "Beauty & Wellness",
    "Education & Tutoring",
    "Technology",
    "Events",
    "Transportation",
    "Pet Care",
    "Professional Services",
];

app.post("/services", auth, uploadImage.single("image"), async (req, res) => {
    try {
        const { name, description, price, category, location, contactPhone } = req.body;

        if (
            typeof name !== "string" || !name.trim() ||
            typeof description !== "string" || !description.trim() ||
            typeof category !== "string" || !category.trim() ||
            typeof location !== "string" || !location.trim()
        ) {
            return res.status(400).json({
                message: "Name, description, category, and location are required",
            });
        }

        const parsedPrice = Number(price);
        if (price === undefined || price === "" || !Number.isFinite(parsedPrice) || parsedPrice < 0) {
            return res.status(400).json({
                message: "Price must be a number greater than or equal to 0",
            });
        }

        if (contactPhone !== undefined &&
            (typeof contactPhone !== "string" || contactPhone.trim().length > 30)) {
            return res.status(400).json({ message: "Contact phone must be at most 30 characters" });
        }

        const selectedCategory = SERVICE_CATEGORIES.find(
            (item) => item.toLowerCase() === category.trim().toLowerCase()
        );

        if (!selectedCategory) {
            return res.status(400).json({
                message: "Invalid category",
                allowedCategories: SERVICE_CATEGORIES,
            });
        }

        let image = "";
        let imagePublicId = "";

        if (req.file) {
            if (
                !process.env.CLOUDINARY_CLOUD_NAME ||
                !process.env.CLOUDINARY_API_KEY ||
                !process.env.CLOUDINARY_API_SECRET
            ) {
                return res.status(500).json({ message: "Image uploads are not configured" });
            }

            const uploadedImage = await uploadToCloudinary(req.file.buffer);
            image = uploadedImage.secure_url;
            imagePublicId = uploadedImage.public_id;
        }

        const service = await Service.create({
            name: name.trim(),
            description: description.trim(),
            price: parsedPrice,
            image,
            imagePublicId,
            category: selectedCategory,
            location: location.trim(),
            contactPhone: contactPhone?.trim() || "",
            owner: req.user.id,
        });

        await service.populate("owner", "name email");

        return res.status(201).json({
            message: "Service created successfully",
            service,
        });
    } catch (err) {
        console.error("Create service error:", err.message);
        return res.status(500).json({ message: "Server error" });
    }
});


/*=======================================
    Editing Services
=======================================*/


app.patch("/services/:id", auth, uploadImage.single("image"), async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ message: "Invalid service ID" });
        }

        const service = await Service.findById(req.params.id);

        if (!service) {
            return res.status(404).json({ message: "Service not found" });
        }

        if (service.owner.toString() !== req.user.id) {
            return res.status(403).json({
                message: "You can only edit your own services",
            });
        }

        const { name, description, price, category, location, contactPhone } = req.body;

        if (name !== undefined) {
            if (
                typeof name !== "string" ||
                name.trim().length < 2 ||
                name.trim().length > 100
            ) {
                return res.status(400).json({
                    message: "Name must be 2–100 characters",
                });
            }
            service.name = name.trim();
        }

        if (description !== undefined) {
            if (
                typeof description !== "string" ||
                !description.trim() ||
                description.trim().length > 2000
            ) {
                return res.status(400).json({
                    message: "Description is required and must be at most 2000 characters",
                });
            }
            service.description = description.trim();
        }

        if (price !== undefined) {
            const parsedPrice = Number(price);

            if (price === "" || !Number.isFinite(parsedPrice) || parsedPrice < 0) {
                return res.status(400).json({
                    message: "Price must be a number greater than or equal to 0",
                });
            }

            service.price = parsedPrice;
        }

        if (contactPhone !== undefined) {
            if (typeof contactPhone !== "string" || contactPhone.trim().length > 30) {
                return res.status(400).json({
                    message: "Contact phone must be at most 30 characters",
                });
            }

            service.contactPhone = contactPhone.trim();
        }
        if (category !== undefined) {
            const categories = [
                "Home Services",
                "Cleaning",
                "Repairs & Maintenance",
                "Beauty & Wellness",
                "Education & Tutoring",
                "Technology",
                "Events",
                "Transportation",
                "Pet Care",
                "Professional Services",
            ];

            const selectedCategory =
                typeof category === "string"
                    ? categories.find(
                        (item) =>
                            item.toLowerCase() === category.trim().toLowerCase()
                    )
                    : null;

            if (!selectedCategory) {
                return res.status(400).json({
                    message: "Invalid category",
                    allowedCategories: categories,
                });
            }

            service.category = selectedCategory;
        }

        if (location !== undefined) {
            if (
                typeof location !== "string" ||
                !location.trim() ||
                location.trim().length > 150
            ) {
                return res.status(400).json({
                    message: "Location is required and must be at most 150 characters",
                });
            }
            service.location = location.trim();
        }

        let oldImagePublicId = "";

        if (req.file) {
            if (
                !process.env.CLOUDINARY_CLOUD_NAME ||
                !process.env.CLOUDINARY_API_KEY ||
                !process.env.CLOUDINARY_API_SECRET
            ) {
                return res.status(500).json({
                    message: "Image uploads are not configured",
                });
            }

            oldImagePublicId = service.imagePublicId;

            const uploadedImage = await uploadToCloudinary(req.file.buffer);
            service.image = uploadedImage.secure_url;
            service.imagePublicId = uploadedImage.public_id;
        }

        await service.save();

        // Delete the old image only after the new service data has saved.
        if (oldImagePublicId) {
            try {
                await cloudinary.uploader.destroy(oldImagePublicId, {
                    resource_type: "image",
                });
            } catch (imageError) {
                console.error("Old Cloudinary image deletion failed:", imageError.message);
                await queueImageCleanup(oldImagePublicId, imageError.message);
            }
        }

        await service.populate("owner", "name email");

        return res.json({
            message: "Service updated successfully",
            service,
        });
    } catch (err) {
        console.error("Update service error:", err.message);
        return res.status(500).json({ message: "Server error" });
    }
});

/*=======================================
    Deleting Services
=======================================*/


app.delete("/services/:id", auth, async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ message: "Invalid service ID" });
        }

        const service = await Service.findById(req.params.id);

        if (!service) {
            return res.status(404).json({ message: "Service not found" });
        }

        if (service.owner.toString() !== req.user.id) {
            return res.status(403).json({
                message: "You can only delete your own services",
            });
        }

        if (service.imagePublicId) {
            try {
                const result = await cloudinary.uploader.destroy(service.imagePublicId, {
                    resource_type: "image",
                });

                if (result.result !== "ok" && result.result !== "not found") {
                    await queueImageCleanup(
                        service.imagePublicId,
                        `Cloudinary result: ${result.result}`
                    );
                }
            } catch (imageError) {
                console.error("Cloudinary image deletion failed:", imageError.message);
                await queueImageCleanup(service.imagePublicId, imageError.message);
            }
        }

        await User.updateMany(
            { favorites: service._id },
            { $pull: { favorites: service._id } }
        );

        await service.deleteOne();

        return res.json({ message: "Service deleted successfully" });
    } catch (err) {
        console.error("Delete service error:", err.message);
        return res.status(500).json({ message: "Server error" });
    }
});



/*=======================================
    Last OR End of backend
=======================================*/

app.get("/", (req, res) => res.send("API is running"));
async function start() {
    await mongoose.connect(process.env.MONGO_URI);
    await retryImageCleanup()
    const port = process.env.PORT || 3000;
    app.listen(port, () => console.log(`Server listening on port http://localhost:${port}`));
}

app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        const message =
            err.code === "LIMIT_FILE_SIZE"
                ? "Image must be 5 MB or smaller"
                : err.message;

        return res.status(400).json({ message });
    }

    if (err.message === "Only image files are allowed") {
        return res.status(400).json({ message: err.message });
    }

    console.error("Request error:", err.message);
    return res.status(500).json({ message: "Server error" });
});

start().catch((err) => {
    console.error("Startup error:", err.message);
    process.exit(1);
});


