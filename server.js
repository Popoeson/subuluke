// =====================
// server.js
// =====================
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');
const axios = require('axios');

const app = express();
const corsOptions = {
  origin: "https://subuluke.vercel.app", // frontend domain
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  credentials: true, // if sending cookies/auth headers
};

app.use(cors(corsOptions));
app.use(express.json());

// =====================
// MongoDB Connection
// =====================
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(()=>console.log('MongoDB connected'))
.catch(err=>console.error(err));

// =====================
// Cloudinary Config
// =====================
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// =====================
// Product Schema (Simplified for Admin Form)
// =====================
const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { type: String, required: true },
  price: { type: Number, required: true },
  slashPrice: { type: Number, default: 0 },        // optional slashed price
  mainImage: { type: String, required: true },     // single uploaded image
  status: { type: String, enum: ["in_stall", "out_of_stall"], default: "in_stall" }, // stock status
  featured: { type: Boolean, default: false },     // featured product toggle
}, { timestamps: true });

const Product = mongoose.model('Product', productSchema);

// =====================
// Hero Image Schema
// =====================
const heroImageSchema = new mongoose.Schema({
  imageUrl: { type: String, required: true },
  isActive: { type: Boolean, default: false },
}, { timestamps: true });

const HeroImage = mongoose.model('HeroImage', heroImageSchema);

// =====================
// Order Schema
// =====================
const orderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  reference: { type: String, required: true },
  customer: {
    name: String,
    email: String,
    phone: String,
    address: String,
    nearestBustop: String,
    deliveryMode: String
  },
  items: Array,
  amount: Number,
  status: { 
  type: String, 
  enum: ["pending", "success", "failed"], 
  default: "pending" 
}
}, { timestamps: true });

const Order = mongoose.model("Order", orderSchema);

// =====================
// Multer Config
// =====================
const storage = multer.memoryStorage();
const upload = multer({ storage });

// =====================
// Helper: Upload to Cloudinary
// =====================
const uploadToCloudinary = (buffer) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'maison_products' },
      (error, result) => {
        if (result) resolve(result);
        else reject(error);
      }
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
};

const uploadHeroToCloudinary = (buffer) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'maison_hero' },
      (error, result) => {
        if (result) resolve(result);
        else reject(error);
      }
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
};

// =====================
// Routes
// =====================

// ---- Create Product ----
app.post('/api/products', upload.single('images'), async (req, res) => {
  try {

    const { name, category, price, slashPrice, description, status, featured } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }

    // Upload image to Cloudinary
    const uploadResult = await uploadToCloudinary(req.file.buffer);

    // 🔥 Optimize product image
    const mainImage = uploadResult.secure_url.replace(
      "/upload/",
      "/upload/f_auto,q_auto,w_800/"
    );

    const newProduct = new Product({
      name,
      category,
      price: Number(price),
      slashPrice: Number(slashPrice || 0),
      description: description || "",
      status: status || "in_stall",
      featured: featured === 'true',
      mainImage
    });

    await newProduct.save();

    res.status(201).json(newProduct);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---- Update Product ----
app.put('/api/products/:id', upload.single('images'), async (req, res) => {
  try {
    const { name, category, price, slashPrice, description, status, featured } = req.body;

    const updateData = {
      name,
      category,
      price: Number(price),
      slashPrice: Number(slashPrice || 0),
      description: description || "",
      status: status || "in_stall", // ✅ save status properly
      featured: featured === 'true'
    };

    if (req.file) {
      const uploadResult = await uploadToCloudinary(req.file.buffer);
      updateData.mainImage = uploadResult.secure_url;
    }

    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    res.json(updatedProduct);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---- Get All Products ----
app.get('/api/products', async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---- Delete Product ----
app.delete('/api/products/:id', async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    res.json({ message: 'Product deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

//=====================
// HERO SECTION 
//=====================

//--- CREATE HERO -----
app.post('/api/hero-images', upload.single('image'), async (req, res) => {
  try {

    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }

    const result = await uploadHeroToCloudinary(req.file.buffer);

    // 🔥 Optimize hero image
    const optimizedHeroUrl = result.secure_url.replace(
      "/upload/",
      "/upload/f_auto,q_auto,w_1600/"
    );

    const hero = new HeroImage({
      imageUrl: optimizedHeroUrl,
      isActive: req.body.isActive === 'true' || req.body.isActive === true
    });

    await hero.save();

    res.status(201).json(hero);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

//----- FETCH HERO -----
app.get('/api/hero-images', async (req, res) => {
  try {
    const heroes = await HeroImage.find().sort({ createdAt: -1 });
    res.json(heroes);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

//---- ACTIVATE/DEACTIVATE HERO
app.patch('/api/hero-images/:id/toggle', async (req, res) => {
  try {
    const hero = await HeroImage.findById(req.params.id);
    if (!hero) return res.status(404).json({ error: 'Hero image not found' });

    hero.isActive = !hero.isActive;
    await hero.save();

    res.json(hero);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

//---- DELETE HERO----
app.delete('/api/hero-images/:id', async (req, res) => {
  try {
    await HeroImage.findByIdAndDelete(req.params.id);
    res.json({ message: 'Hero image deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// =====================
// PAYSTACK INTEGRATION
// =====================

// ---- Initialize Payment ----
app.post('/api/paystack/initialize', async (req, res) => {
  try {
    const { email, amount, metadata } = req.body;

    if (!email || !amount) {
      return res.status(400).json({ error: "Email and amount are required" });
    }

    const response = await axios.post(
  "https://api.paystack.co/transaction/initialize",
  {
    email,
    amount,
    metadata,
    callback_url: "https://subuluke.vercel.app/checkout.html" //redirect back to checkout
  },
  {
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json"
    }
  }
);

    const reference = response.data.data.reference;

    // 🔥 CREATE PENDING ORDER
    const newOrder = new Order({
      orderId: `ORD-${Date.now()}`,
      reference,
      customer: {
        name: metadata.name,
        email: metadata.email,
        phone: metadata.phone,
        address: metadata.address,
        nearestBustop: metadata.nearestBustop,
        deliveryMode: metadata.deliveryMode
      },
      items: metadata.items || [],
      amount: amount / 100,
      status: "pending"
    });

    await newOrder.save();

    res.json({
      authorization_url: response.data.data.authorization_url,
      reference,
      publicKey: process.env.PAYSTACK_PUBLIC_KEY
    });

  } catch (error) {
    console.error("Paystack Initialize Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Payment initialization failed" });
  }
});

// ---- Verify Payment ----

app.get('/api/paystack/verify/:reference', async (req, res) => {
  try {
    const { reference } = req.params;

    // 🔍 FIND EXISTING ORDER
    let order = await Order.findOne({ reference });

    if (!order) {
      return res.status(404).json({
        status: "error",
        message: "Order not found"
      });
    }

    // ✅ PREVENT DUPLICATE PROCESSING
    if (order.status === "success") {
      return res.json({
        status: "success",
        message: "Order already verified",
        orderId: order.orderId
      });
    }

    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
        }
      }
    );

    const data = response.data.data;

    if (data.status === "success") {

      // ✅ UPDATE ORDER
      order.status = "success";
      order.amount = data.amount / 100;

      await order.save();

      return res.json({
        status: "success",
        orderId: order.orderId,
        message: "Payment verified successfully"
      });

    } else {

      // ❌ FAILED PAYMENT
      order.status = "failed";
      await order.save();

      return res.status(400).json({
        status: "failed",
        message: "Payment not successful"
      });
    }

  } catch (error) {
    console.error("Paystack Verify Error:", error.response?.data || error.message);

    // ⚠️ KEEP ORDER AS PENDING IF ERROR
    return res.status(500).json({
      status: "pending",
      message: "Verification error, try again"
    });
  }
});

// GET ORDERS
// ---- Get All Orders ----
app.get('/api/orders', async (req,res)=>{
  try{
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json(orders);
  }catch(err){
    res.status(500).json({ error: "Server error" });
  }
});

// =====================
// GET ORDER BY ORDER ID
// =====================
app.get('/api/orders/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findOne({ orderId });

    if (!order) {
      return res.status(404).json({
        status: "error",
        message: "Order not found"
      });
    }

    res.json({
      status: "success",
      order
    });

  } catch (error) {
    console.error("Fetch Order Error:", error.message);

    res.status(500).json({
      status: "error",
      message: "Server error"
    });
  }
});

// HEALTH CHECK

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});


// =====================
// Start Server
// =====================
const PORT = process.env.PORT || 5000;
app.listen(PORT, ()=>console.log(`Server running on port ${PORT}`));