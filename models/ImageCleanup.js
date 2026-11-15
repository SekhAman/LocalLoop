const mongoose = require("mongoose");

const imageCleanupSchema = new mongoose.Schema(
    {
        publicId: {
            type: String,
            required: true,
            unique: true,
        },
        attempts: {
            type: Number,
            default: 0,
        },
        lastError: {
            type: String,
            default: "",
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("ImageCleanup", imageCleanupSchema);