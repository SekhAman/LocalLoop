const { z } = require("zod");

const serviceSchema = z
    .object({
        name: z.string().trim().min(2).max(100),
        description: z.string().trim().min(1).max(2000),
        price: z
            .string()
            .trim()
            .min(1, "Price is required")
            .transform(Number)
            .pipe(z.number().finite().min(0)),
        category: z.string().trim().min(1).max(80),
        location: z.string().trim().min(1).max(150),
        contactPhone: z.string().trim().max(30).optional(),
    })
    .strict();

module.exports = { serviceSchema };