const { z } = require("zod");

const publicContactEmailSchema = z
    .object({
        // An empty string clears the public contact email.
        publicContactEmail: z.union([
            z.literal(""),
            z.string().trim().max(254).email(),
        ]),
    })
    .strict();

module.exports = { publicContactEmailSchema };