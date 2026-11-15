const jwt = require("jsonwebtoken");
const User = require("../models/user");

const auth = async (req, res, next) => {
    const token = req.header("Authorization");

    if (!token || !token.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Access denied. Token required." });
    }

    try {
        const decoded = jwt.verify(token.slice(7), process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select("tokenVersion");

        if (!user || decoded.tokenVersion !== user.tokenVersion) {
            return res.status(401).json({ message: "Invalid or revoked token." });
        }

        req.user = decoded;
        next();
    } catch {
        return res.status(401).json({ message: "Invalid or expired token." });
    }
};

module.exports = auth;