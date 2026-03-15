require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const axios = require("axios");
const cloudinary = require("cloudinary").v2;
const bodyParser = require("body-parser");
const crypto = require("crypto");


const app = express();

/* =====================
   MIDDLEWARE
===================== */
app.use(cors());
app.use((req, res, next) => {
  if (req.originalUrl === "/api/paystack/webhook") {
    next(); // skip json parser
  } else {
    express.json()(req, res, next);
  }
});
app.use(express.urlencoded({ extended: true }));

/* =====================
   DATABASE
===================== */
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.error(err));

/* =====================
   CLOUDINARY CONFIG
===================== */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

/* =====================
   MULTER CONFIG
===================== */
const storage = multer.memoryStorage();
const upload = multer({ storage });

/* =====================
   SCHEMAS
===================== */
// Ticket
const ticketSchema = new mongoose.Schema(
  { image: String, name: String, description: String, price: Number },
  { timestamps: true }
);
const Ticket = mongoose.model("Ticket", ticketSchema);

// Artiste
const artisteSchema = new mongoose.Schema(
  { image: String, name: String },
  { timestamps: true }
);
const Artiste = mongoose.model("Artiste", artisteSchema);

// Hero
const heroSchema = new mongoose.Schema(
  { image: String, active: { type: Boolean, default: false } },
  { timestamps: true }
);
const Hero = mongoose.model("Hero", heroSchema);

// Order
// Order
const orderSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, required: true },
    items: {
      type: [
        {
          _id: { type: mongoose.Schema.Types.ObjectId, ref: "Ticket", required: true }, // <-- updated
          name: { type: String, required: true },
          price: { type: Number, required: true },
          quantity: { type: Number, required: true }
        }
      ],
      validate: [arr => arr.length > 0, "Order must have at least one item"]
    },
    totalAmount: { type: Number, required: true },
    paymentReference: { type: String, index: true },
    paymentStatus: { type: String, enum: ["pending","paid","failed"], default: "pending" },
    orderRef: { type: String, unique: true, required: true },
    paymentMethod: { type: String, enum: ["paystack","bank"], default: "paystack" },
    statusHistory: [
      { status: String, updatedAt: { type: Date, default: Date.now }, note: String }
    ]
  },
  { timestamps: true }
);

const Order = mongoose.model("Order", orderSchema);

/* =====================
   TICKETS ROUTES
===================== */
app.post("/api/tickets", upload.single("image"), async (req, res) => {
  try {
    const { name, description, price } = req.body;
    const uploadRes = await cloudinary.uploader.upload(
      `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`,
      { folder: "concert_tickets" }
    );
    const ticket = await Ticket.create({ image: uploadRes.secure_url, name, description, price });
    res.status(201).json(ticket);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create ticket" });
  }
});

app.get("/api/tickets", async (req, res) => {
  res.json(await Ticket.find().sort({ createdAt: -1 }));
});

// NEW: GET single ticket by ID
app.get("/api/tickets/:id", async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });
    res.json(ticket);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch ticket" });
  }
});

app.put("/api/tickets/:id", upload.single("image"), async (req, res) => {
  try {
    let update = req.body;
    if (req.file) {
      const uploadRes = await cloudinary.uploader.upload(
        `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`,
        { folder: "concert_tickets" }
      );
      update.image = uploadRes.secure_url;
    }
    const updated = await Ticket.findByIdAndUpdate(req.params.id, update, { new: true });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to update ticket" });
  }
});

app.delete("/api/tickets/:id", async (req, res) => {
  try {
    await Ticket.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to delete ticket" });
  }
});

/* =====================
   ARTISTES ROUTES
===================== */
app.post("/api/artistes", upload.single("image"), async (req, res) => {
  try {
    const uploadRes = await cloudinary.uploader.upload(
      `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`,
      { folder: "concert_artistes" }
    );
    const artiste = await Artiste.create({ image: uploadRes.secure_url, name: req.body.name });
    res.status(201).json(artiste);
  } catch (err) {
    res.status(500).json({ error: "Failed to create artiste" });
  }
});

app.get("/api/artistes", async (req, res) => {
  res.json(await Artiste.find().sort({ createdAt: -1 }));
});

// NEW: GET single artiste by ID
app.get("/api/artistes/:id", async (req, res) => {
  try {
    const artiste = await Artiste.findById(req.params.id);
    if (!artiste) return res.status(404).json({ error: "Artiste not found" });
    res.json(artiste);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch artiste" });
  }
});

// NEW: PUT artiste
app.put("/api/artistes/:id", upload.single("image"), async (req, res) => {
  try {
    let update = { name: req.body.name };
    if (req.file) {
      const uploadRes = await cloudinary.uploader.upload(
        `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`,
        { folder: "concert_artistes" }
      );
      update.image = uploadRes.secure_url;
    }
    const updated = await Artiste.findByIdAndUpdate(req.params.id, update, { new: true });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to update artiste" });
  }
});

app.delete("/api/artistes/:id", async (req, res) => {
  try {
    await Artiste.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to delete artiste" });
  }
});

/* =====================
   HERO ROUTES
===================== */
const heroRouter = express.Router();

heroRouter.get("/", async (_, res) => res.json(await Hero.find().sort({ createdAt: -1 })));
heroRouter.get("/:id", async (req, res) => {
  try {
    const hero = await Hero.findById(req.params.id);
    if (!hero) return res.status(404).json({ error: "Hero not found" });
    res.json(hero);
  } catch {
    res.status(500).json({ error: "Failed to fetch hero" });
  }
});
heroRouter.post("/", upload.single("image"), async (req, res) => {
  const uploadRes = await cloudinary.uploader.upload(
    `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`,
    { folder: "concert_hero" }
  );
  res.status(201).json(await Hero.create({ image: uploadRes.secure_url }));
});
heroRouter.put("/:id", upload.single("image"), async (req, res) => {
  try {
    let update = {};
    if (req.file) {
      const uploadRes = await cloudinary.uploader.upload(
        `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`,
        { folder: "concert_hero" }
      );
      update.image = uploadRes.secure_url;
    }
    const updated = await Hero.findByIdAndUpdate(req.params.id, update, { new: true });
    res.json(updated);
  } catch {
    res.status(500).json({ error: "Failed to update hero" });
  }
});
heroRouter.patch("/:id/toggle", async (req, res) => {
  try {
    const hero = await Hero.findById(req.params.id);
    await Hero.updateMany({}, { active: false });
    hero.active = !hero.active;
    await hero.save();
    res.json(hero);
  } catch {
    res.status(500).json({ error: "Failed to toggle hero" });
  }
});
heroRouter.delete("/:id", async (req, res) => {
  try {
    await Hero.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to delete hero" });
  }
});

app.use("/api/hero", heroRouter);

/* =====================
   CHECKOUT & PAYSTACK (Optimized)
===================== */

/* -------- CREATE ORDER -------- */
app.post("/api/orders", async (req, res) => {
  try {
    const { name, phone, email, items } = req.body;
    if (!name || !phone || !email || !items || items.length === 0) {
      return res.status(400).json({ error: "Invalid order data" });
    }

    // Map items to ensure only the required fields are stored
    const orderItems = items.map(i => ({
      _id: i._id,
      name: i.name,
      price: i.price,
      quantity: i.quantity
    }));

    const totalAmount = orderItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const orderRef = `OKIZZ-${Date.now()}`;

    const order = await Order.create({
      name,
      phone,
      email,
      items: orderItems,
      totalAmount,
      orderRef,
      paymentStatus: "pending",
    });

    res.json({ success: true, order });
  } catch (err) {
    console.error("Create order error:", err.message);
    res.status(500).json({ error: "Failed to create order" });
  }
});

/* -------- INITIALIZE PAYSTACK (WITH SPLIT GROUP & REDIRECT) -------- */
app.post("/api/paystack/init", async (req, res) => {
  try {
    const { email, amount, orderRef } = req.body;

    if (!email || !amount || !orderRef) {
      return res.status(400).json({ error: "Invalid payment data" });
    }

    // 1️⃣ Confirm order exists
    const order = await Order.findOne({ orderRef });
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // 2️⃣ Initialize Paystack with SPLIT CODE + CALLBACK URL
    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email,
        amount: amount * 100, // amount in kobo
        split_code: process.env.PAYSTACK_SPLIT_CODE,
        callback_url: "https://okizz.vercel.app/checkout.html", // <-- redirect back here
        metadata: {
          orderRef,
          customer_name: order.name,
          customer_phone: order.phone
        }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const paystackRef = response.data.data.reference;

    // 3️⃣ Save Paystack reference on order
    order.paymentReference = paystackRef;
    await order.save();

    // 4️⃣ Send Paystack authorization URL to frontend
    res.json({
      status: true,
      message: "Payment initialized",
      data: {
        authorization_url: response.data.data.authorization_url,
        reference: paystackRef
      }
    });

  } catch (err) {
    console.error("Paystack init error:", err.response?.data || err.message);
    res.status(500).json({ error: "Payment initialization failed" });
  }
});

/* -------- VERIFY PAYMENT -------- */
app.get("/api/paystack/verify/:reference", async (req, res) => {
  try {
    const reference = req.params.reference;

    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
    );

    const data = response.data.data;

    const order = await Order.findOne({
      $or: [{ paymentReference: reference }, { orderRef: data.metadata?.orderRef }],
    });

    if (!order) return res.status(404).json({ success: false, message: "Order not found", order: null });

    if (data.status === "success" && order.paymentStatus !== "paid") {
      // Update order
      order.paymentStatus = "paid";
      order.paymentReference = reference;
      await order.save();
    }

    res.json({ success: data.status === "success", order });
  } catch (err) {
    console.error("Paystack verify error:", err.message);
    res.status(500).json({ success: false, message: "Verification failed", order: null });
  }
});

/* -------- PAYSTACK WEBHOOK -------- */
 app.post(
  "/api/paystack/webhook",
  bodyParser.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      const secret = process.env.PAYSTACK_SECRET_KEY;

      const signature = req.headers["x-paystack-signature"];

      const hash = crypto
        .createHmac("sha512", secret)
        .update(req.body)
        .digest("hex");

      if (hash !== signature) {
        console.log("Invalid webhook signature");
        return res.sendStatus(401);
      }

      const event = JSON.parse(req.body.toString());

      if (event.event === "charge.success") {
        const data = event.data;
        const orderRef = data.metadata?.orderRef;

        if (!orderRef) {
          console.log("Webhook missing orderRef");
          return res.sendStatus(400);
        }

        const order = await Order.findOne({ orderRef });

        if (!order) {
          console.log("Order not found for webhook:", orderRef);
          return res.sendStatus(404);
        }

        if (order.paymentStatus !== "paid") {
          order.paymentStatus = "paid";
          order.paymentReference = data.reference;
          order.statusHistory.push({
            status: "paid",
            note: "Confirmed via Paystack webhook"
          });
          await order.save();

          console.log("✅ Order marked PAID:", orderRef);
        }
      }

      res.sendStatus(200);
    } catch (err) {
      console.error("Webhook error:", err);
      res.sendStatus(500);
    }
  }
);

/* -------- GET SINGLE ORDER BY REF -------- */
app.get("/api/orders/ref/:orderRef", async (req, res) => {
  try {
    const order = await Order.findOne({ orderRef: req.params.orderRef });
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    res.json(order); // ✅ return FULL document
  } catch (err) {
    console.error("Fetch order error:", err.message);
    res.status(500).json({ error: "Failed to fetch order" });
  }
});

// GET /api/orders/pending/:email
app.get("/api/orders/pending/:email", async (req, res) => {
  try {
    const { email } = req.params;
    const order = await Order.findOne({ email, paymentStatus: "pending" }).sort({ createdAt: -1 });
    if (!order) return res.status(404).json(null);
    res.json(order);
  } catch(err) {
    console.error("Fetch pending order error:", err);
    res.status(500).json({ error: "Failed to fetch pending order" });
  }
});

// GET ALL ORDERS (ADMIN)
app.get("/api/orders", async (req, res) => {
  try {
    const orders = await Order.find()
      .sort({ createdAt: -1 }); // latest first

    res.json(orders);
  } catch (error) {
    console.error("Fetch orders error:", error.message);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

/* GET SINGLE ORDER
app.get("/api/orders/:id", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    res.json(order);
  } catch {
    res.status(500).json({ error: "Failed to fetch order" });
  }
});*/

// HEALTH CHECK

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

/* =====================
   SERVER
===================== */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));