const mongoose = require("mongoose");

const serviceSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            minlength: 2,
            maxlength: 100,
        },
        description: {
            type: String,
            required: true,
            trim: true,
            maxlength: 2000,
        },
        price: {
            type: Number,
            required: true,
            min: 0,
        },
        image: {
            type: String,
            trim: true,
            default: "",
        },
        imagePublicId: {
            type: String,
            default: "",
        },
        category: {
            type: String,
            required: true,
            trim: true,
            maxlength: 80,
        },
        location: {
            type: String,
            required: true,
            trim: true,
            maxlength: 150,
        },
        contactPhone: {
            type: String,
            trim: true,
            default: "",
            maxlength: 30,
        },
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Service", serviceSchema);