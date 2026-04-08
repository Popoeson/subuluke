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

const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");

const app = express();

/* =====================
   SECURITY MIDDLEWARE
===================== */

// Hide express fingerprint
app.disable("x-powered-by");

// Helmet security headers
app.use(helmet());

// Prevent MongoDB injection
app.use(mongoSanitize());

// Limit request size
app.use(express.json({ limit: "1mb" }));

// Global API rate limit
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120
});

app.use("/api", apiLimiter);


/* =====================
   CORS
===================== */

const corsOptions = {
  origin: "https://subuluke.vercel.app",
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  credentials: true
};

app.use(cors(corsOptions));


/* =====================
   MongoDB Connection
===================== */

mongoose.connect(process.env.MONGO_URI,{
  useNewUrlParser:true,
  useUnifiedTopology:true
})
.then(()=>console.log("MongoDB connected"))
.catch(err=>console.error(err));


/* =====================
   Cloudinary Config
===================== */

cloudinary.config({
  cloud_name:process.env.CLOUDINARY_CLOUD_NAME,
  api_key:process.env.CLOUDINARY_API_KEY,
  api_secret:process.env.CLOUDINARY_API_SECRET
});


/* =====================
   SCHEMAS
===================== */

// PRODUCTS
const productSchema = new mongoose.Schema({
  name:{type:String,required:true},
  category:{type:String,required:true},
  price:{type:Number,required:true},
  slashPrice:{type:Number,default:0},
  mainImage:{type:String,required:true},
  status:{type:String,enum:["in_stall","out_of_stall"],default:"in_stall"},
  featured:{type:Boolean,default:false}
},{timestamps:true});

const Product = mongoose.model("Product",productSchema);


// HERO IMAGES
const heroImageSchema = new mongoose.Schema({
  imageUrl:{type:String,required:true},
  isActive:{type:Boolean,default:false}
},{timestamps:true});

const HeroImage = mongoose.model("HeroImage",heroImageSchema);


// ORDERS
const orderSchema = new mongoose.Schema({

  orderId:{type:String,required:true,unique:true},

  reference:{type:String,required:true,unique:true},

  customer:{
    name:String,
    email:String,
    phone:String,
    address:String,
    nearestBustop:String,
    deliveryMode:String
  },

  items:Array,

  amount:Number,

  status:{
    type:String,
    enum:["pending","success","failed"],
    default:"pending"
  }

},{timestamps:true});

const Order = mongoose.model("Order",orderSchema);


/* =====================
   MULTER CONFIG
===================== */

const storage = multer.memoryStorage();

const upload = multer({

  storage,

  limits:{
    fileSize:3 * 1024 * 1024 // 3MB
  },

  fileFilter:(req,file,cb)=>{

    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp"
    ];

    if(!allowed.includes(file.mimetype)){
      return cb(new Error("Invalid file type"));
    }

    cb(null,true);
  }

});


/* =====================
   RATE LIMITS
===================== */

const paymentLimiter = rateLimit({
  windowMs:15 * 60 * 1000,
  max:10
});

const uploadLimiter = rateLimit({
  windowMs:10 * 60 * 1000,
  max:30
});


/* =====================
   CLOUDINARY HELPERS
===================== */

const uploadToCloudinary = (buffer)=>{
  return new Promise((resolve,reject)=>{

    const stream = cloudinary.uploader.upload_stream(
      {folder:"subuluke_products"},
      (error,result)=>{
        if(result) resolve(result);
        else reject(error);
      }
    );

    streamifier.createReadStream(buffer).pipe(stream);

  });
};

const uploadHeroToCloudinary = (buffer)=>{
  return new Promise((resolve,reject)=>{

    const stream = cloudinary.uploader.upload_stream(
      {folder:"subuluke_hero"},
      (error,result)=>{
        if(result) resolve(result);
        else reject(error);
      }
    );

    streamifier.createReadStream(buffer).pipe(stream);

  });
};


/* =====================
   PRODUCT ROUTES
===================== */

// CREATE PRODUCT
app.post("/api/products",uploadLimiter,upload.single("images"),async(req,res)=>{

  try{

    const {name,category,price,slashPrice,description,status,featured} = req.body;

    if(!req.file){
      return res.status(400).json({error:"No image uploaded"});
    }

    const uploadResult = await uploadToCloudinary(req.file.buffer);

    const mainImage = uploadResult.secure_url.replace(
      "/upload/",
      "/upload/f_auto,q_auto,w_800/"
    );

    const newProduct = new Product({
      name,
      category,
      price:Number(price),
      slashPrice:Number(slashPrice||0),
      description:description||"",
      status:status||"in_stall",
      featured:featured==="true",
      mainImage
    });

    await newProduct.save();

    res.status(201).json(newProduct);

  }catch(err){

    console.error(err);
    res.status(500).json({error:"Server error"});

  }

});


// GET PRODUCTS
app.get("/api/products",async(req,res)=>{

  try{

    const products = await Product.find().sort({createdAt:-1});

    res.json(products);

  }catch(err){

    res.status(500).json({error:"Server error"});

  }

});


// UPDATE PRODUCT
app.put("/api/products/:id",upload.single("images"),async(req,res)=>{

  try{

    const {name,category,price,slashPrice,description,status,featured} = req.body;

    const updateData={
      name,
      category,
      price:Number(price),
      slashPrice:Number(slashPrice||0),
      description:description||"",
      status:status||"in_stall",
      featured:featured==="true"
    };

    if(req.file){

      const uploadResult = await uploadToCloudinary(req.file.buffer);

      updateData.mainImage = uploadResult.secure_url.replace(
        "/upload/",
        "/upload/f_auto,q_auto,w_800/"
      );

    }

    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      {new:true}
    );

    res.json(updatedProduct);

  }catch(err){

    res.status(500).json({error:"Server error"});

  }

});


// DELETE PRODUCT
app.delete("/api/products/:id",async(req,res)=>{

  try{

    await Product.findByIdAndDelete(req.params.id);

    res.json({message:"Product deleted"});

  }catch(err){

    res.status(500).json({error:"Server error"});

  }

});


/* =====================
   HERO ROUTES
===================== */

app.post("/api/hero-images",uploadLimiter,upload.single("image"),async(req,res)=>{

  try{

    if(!req.file){
      return res.status(400).json({error:"No image uploaded"});
    }

    const result = await uploadHeroToCloudinary(req.file.buffer);

    const hero = new HeroImage({
      imageUrl:result.secure_url.replace(
        "/upload/",
        "/upload/f_auto,q_auto,w_1600/"
      ),
      isActive:req.body.isActive==="true"
    });

    await hero.save();

    res.status(201).json(hero);

  }catch(err){

    res.status(500).json({error:"Server error"});

  }

});


app.get("/api/hero-images",async(req,res)=>{

  try{

    const heroes = await HeroImage.find().sort({createdAt:-1});

    res.json(heroes);

  }catch(err){

    res.status(500).json({error:"Server error"});

  }

});


app.patch("/api/hero-images/:id/toggle",async(req,res)=>{

  try{

    const hero = await HeroImage.findById(req.params.id);

    if(!hero) return res.status(404).json({error:"Hero not found"});

    hero.isActive=!hero.isActive;

    await hero.save();

    res.json(hero);

  }catch(err){

    res.status(500).json({error:"Server error"});

  }

});


app.delete("/api/hero-images/:id",async(req,res)=>{

  try{

    await HeroImage.findByIdAndDelete(req.params.id);

    res.json({message:"Hero deleted"});

  }catch(err){

    res.status(500).json({error:"Server error"});

  }

});


/* =====================
   PAYSTACK
===================== */

app.post("/api/paystack/initialize", paymentLimiter, async (req, res) => {
  try {
    const { email, items, customer } = req.body;

    if (!email || !items || !items.length) {
      return res.status(400).json({ error: "Email and cart items are required" });
    }

    // Fetch products from DB
    const productIds = items.map(i => i.productId);
    const products = await Product.find({ _id: { $in: productIds } });

    if (!products.length) {
      return res.status(400).json({ error: "Invalid products in cart" });
    }

    // Calculate totals securely
    let subtotal = 0;
    const orderItems = [];

    for (const cartItem of items) {
      const product = products.find(p => p._id.toString() === cartItem.productId);
      if (!product) {
        return res.status(400).json({ error: "Product not found" });
      }

      const qty = Number(cartItem.qty);
      if (!qty || qty <= 0 || qty > 20) {
        return res.status(400).json({ error: "Invalid quantity" });
      }

      const itemTotal = product.price * qty;
      subtotal += itemTotal;

      orderItems.push({
        productId: product._id,
        name: product.name,
        image: product.mainImage,
        price: product.price,
        qty,
      });
    }

    const deliveryFee = 1500;
    const total = subtotal + deliveryFee;

    // Initialize Paystack transaction
    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email,
        amount: total * 100, // in kobo
        metadata: {
          customer,
          items: orderItems,
        },
        callback_url: "https://subuluke.vercel.app/checkout.html",
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const reference = response.data.data.reference;

    // Save order as pending
    const newOrder = new Order({
      orderId: `ORD-${Date.now()}`,
      reference,
      customer: {
        name: customer?.name,
        email,
        phone: customer?.phone,
        address: customer?.address,
        nearestBustop: customer?.nearestBustop,
        deliveryMode: customer?.deliveryMode,
      },
      items: orderItems,
      amount: total,
      status: "pending",
    });

    await newOrder.save();

    res.json({
      authorization_url: response.data.data.authorization_url,
      reference,
      publicKey: process.env.PAYSTACK_PUBLIC_KEY,
      subtotal,
      total,
    });
  } catch (error) {
    console.error("Paystack Initialize Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Payment initialization failed" });
  }
});

/* ======= CALCULATE PRODUCT AMOUNT =======*/
app.post("/api/cart/calc", async (req, res) => {
  try {
    const { items } = req.body;
    if (!items || !items.length) return res.json({ subtotal: 0, total: 0 });

    const productIds = items.map(i => i.productId);
    const products = await Product.find({ _id: { $in: productIds } });

    let subtotal = 0;
    for (const item of items) {
      const product = products.find(p => p._id.toString() === item.productId);
      if (product) subtotal += product.price * item.qty;
    }
    const deliveryFee = 1500;
    const total = subtotal + deliveryFee;

    res.json({ subtotal, total });
  } catch (err) {
    console.error(err);
    res.json({ subtotal: 0, total: 0 });
  }
});

/* =====================
   VERIFY PAYMENT
===================== */

app.get("/api/paystack/verify/:reference",async(req,res)=>{

  try{

    const {reference} = req.params;

    const order = await Order.findOne({reference});

    if(!order){
      return res.status(404).json({status:"error",message:"Order not found"});
    }

    if(order.status==="success"){
      return res.json({
        status:"success",
        orderId:order.orderId,
        message:"Already verified"
      });
    }

    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers:{
          Authorization:`Bearer ${process.env.PAYSTACK_SECRET_KEY}`
        }
      }
    );

    const data = response.data.data;

    if(data.status==="success"){

      order.status="success";
      order.amount=data.amount/100;

      await order.save();

      return res.json({
        status:"success",
        orderId:order.orderId
      });

    }

    order.status="failed";
    await order.save();

    res.status(400).json({
      status:"failed",
      message:"Payment failed"
    });

  }catch(error){

    console.error("Verify Error:",error.message);

    res.status(500).json({
      status:"pending",
      message:"Verification error"
    });

  }

});


/* =====================
   ORDER ROUTES
===================== */

app.get("/api/orders",async(req,res)=>{

  try{

    const orders = await Order.find().sort({createdAt:-1});

    res.json(orders);

  }catch(err){

    res.status(500).json({error:"Server error"});

  }

});


app.get("/api/orders/:orderId",async(req,res)=>{

  try{

    const order = await Order.findOne({orderId:req.params.orderId});

    if(!order){
      return res.status(404).json({status:"error",message:"Order not found"});
    }

    res.json({status:"success",order});

  }catch(err){

    res.status(500).json({error:"Server error"});

  }

});


/* =====================
   HEALTH CHECK
===================== */

app.get("/api/health",(req,res)=>{
  res.json({status:"ok"});
});


/* =====================
   START SERVER
===================== */

const PORT = process.env.PORT || 5000;

app.listen(PORT,()=>{
  console.log(`Server running on port ${PORT}`);
});