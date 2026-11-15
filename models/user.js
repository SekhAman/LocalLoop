const mongoose = require("mongoose");


const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        minlength: 2,
        maxlength: 80,
        unique: true,
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    },
    password: {
        type: String, required: true, select: false
    },
    favorites: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Service",
        },
    ],
    tokenVersion: {
        type: Number,
        default: 0,
    },
}, { timestamps: true });


module.exports = mongoose.model("User", userSchema);