import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import env from '../config/env.js';
import { connectDb, disconnectDb } from '../config/db.js';
import User from '../models/User.js';
import VendorProfile from '../models/VendorProfile.js';
import DeliveryAgentProfile from '../models/DeliveryAgentProfile.js';
import Brand from '../models/Brand.js';
import Category from '../models/Category.js';
import Product from '../models/Product.js';
import Listing from '../models/Listing.js';
import Order from '../models/Order.js';
import OrderItem from '../models/OrderItem.js';
import Shipment from '../models/Shipment.js';
import Payment from '../models/Payment.js';
import Address from '../models/Address.js';
import Review from '../models/Review.js';
import Cart from '../models/Cart.js';
import { catalogChanged } from '../services/cache.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BCRYPT_ROUNDS = 10;
const VENDOR_PASSWORD = 'Vendor@Pass2026';
const BUYER_PASSWORD = 'Buyer@Pass2026';
const AGENT_PASSWORD = 'Agent@Pass2026';

// 40 Realistic Sellers/Vendors
const VENDORS_DATA = [
  { name: 'Aarav Sharma', shopName: 'Royal Silk & Handlooms', city: 'Chennai', state: 'Tamil Nadu', pin: '600001', categoryFocus: 'fashion', fssai: false, drug: false },
  { name: 'Priya Nair', shopName: 'Malabar Spice Heritage', city: 'Kochi', state: 'Kerala', pin: '682001', categoryFocus: 'groceries', fssai: true, drug: false },
  { name: 'Vikram Patel', shopName: 'Zenith Smart Electronics', city: 'Ahmedabad', state: 'Gujarat', pin: '380001', categoryFocus: 'electronics', fssai: false, drug: false },
  { name: 'Rajesh Singhania', shopName: 'Capital Mobiles & Audio', city: 'New Delhi', state: 'Delhi', pin: '110001', categoryFocus: 'mobiles', fssai: false, drug: false },
  { name: 'Ananya Mukherjee', shopName: 'Bengal Terracotta & Craft', city: 'Kolkata', state: 'West Bengal', pin: '700001', categoryFocus: 'home-kitchen', fssai: false, drug: false },
  { name: 'Suresh Deshmukh', shopName: 'Deccan Cotton Mills', city: 'Pune', state: 'Maharashtra', pin: '411001', categoryFocus: 'fashion', fssai: false, drug: false },
  { name: 'Meera Krishnan', shopName: 'Kaveri Organic Pantry', city: 'Coimbatore', state: 'Tamil Nadu', pin: '641001', categoryFocus: 'groceries', fssai: true, drug: false },
  { name: 'Amit Bansal', shopName: 'Jaipur Jewels & Watches', city: 'Jaipur', state: 'Rajasthan', pin: '302001', categoryFocus: 'fashion', fssai: false, drug: false },
  { name: 'Sunita Rao', shopName: 'Bangalore Teas & Botanicals', city: 'Bengaluru', state: 'Karnataka', pin: '560001', categoryFocus: 'food-beverages', fssai: true, drug: false },
  { name: 'Deepak Verma', shopName: 'Northpeak Outdoor & Sport', city: 'Dehradun', state: 'Uttarakhand', pin: '248001', categoryFocus: 'sports-fitness', fssai: false, drug: false },
  { name: 'Harish Reddy', shopName: 'Telangana Cookware & Vessels', city: 'Hyderabad', state: 'Telangana', pin: '500001', categoryFocus: 'vessels-kitchenware', fssai: false, drug: false },
  { name: 'Pooja Mehta', shopName: 'Mumbai Glamour & Cosmetics', city: 'Mumbai', state: 'Maharashtra', pin: '400001', categoryFocus: 'beauty-personal-care', fssai: false, drug: false },
  { name: 'Sanjay Gupta', shopName: 'Lucknowi Chikankari Studio', city: 'Lucknow', state: 'Uttar Pradesh', pin: '226001', categoryFocus: 'fashion', fssai: false, drug: false },
  { name: 'Ramesh Chawla', shopName: 'Amritsar Golden Grains', city: 'Amritsar', state: 'Punjab', pin: '143001', categoryFocus: 'groceries', fssai: true, drug: false },
  { name: 'Kavita Joshi', shopName: 'Himalayan Ayurvedic Wellness', city: 'Shimla', state: 'Himachal Pradesh', pin: '171001', categoryFocus: 'medicines-healthcare', fssai: false, drug: true },
  { name: 'Manoj Agarwal', shopName: 'Surat Timepieces & Gems', city: 'Surat', state: 'Gujarat', pin: '395001', categoryFocus: 'fashion', fssai: false, drug: false },
  { name: 'Sneha Kulkarni', shopName: 'Sahyadri Wooden Furniture', city: 'Nashik', state: 'Maharashtra', pin: '422001', categoryFocus: 'furniture', fssai: false, drug: false },
  { name: 'Arvind Tiwari', shopName: 'Banaras Loom Heritage', city: 'Varanasi', state: 'Uttar Pradesh', pin: '221001', categoryFocus: 'fashion', fssai: false, drug: false },
  { name: 'Neha Bhatia', shopName: 'Punjab Sweet & Confectionery', city: 'Chandigarh', state: 'Punjab', pin: '160001', categoryFocus: 'food-beverages', fssai: true, drug: false },
  { name: 'Sandeep Pillai', shopName: 'Kerala Teak & Living', city: 'Thiruvananthapuram', state: 'Kerala', pin: '695001', categoryFocus: 'furniture', fssai: false, drug: false },
  { name: 'Ritu Saxena', shopName: 'Bhopal Zari Crafts', city: 'Bhopal', state: 'Madhya Pradesh', pin: '462001', categoryFocus: 'fashion', fssai: false, drug: false },
  { name: 'Gaurav Khurana', shopName: 'Delhi Audio Labs & Acoustics', city: 'New Delhi', state: 'Delhi', pin: '110020', categoryFocus: 'electronics', fssai: false, drug: false },
  { name: 'Divya Swaminathan', shopName: 'Tanjore Bronze & Metalcraft', city: 'Thanjavur', state: 'Tamil Nadu', pin: '613001', categoryFocus: 'home-kitchen', fssai: false, drug: false },
  { name: 'Alok Jain', shopName: 'Indore Spices & Namkeen', city: 'Indore', state: 'Madhya Pradesh', pin: '452001', categoryFocus: 'food-beverages', fssai: true, drug: false },
  { name: 'Shilpa Hegde', shopName: 'Coastal Living & Decor', city: 'Mangaluru', state: 'Karnataka', pin: '575001', categoryFocus: 'home-kitchen', fssai: false, drug: false },
  { name: 'Tarun Mathur', shopName: 'Marwar Leather Crafters', city: 'Jodhpur', state: 'Rajasthan', pin: '342001', categoryFocus: 'fashion', fssai: false, drug: false },
  { name: 'Vandana Sen', shopName: 'Assam Valley CTC & Leaf', city: 'Guwahati', state: 'Assam', pin: '781001', categoryFocus: 'food-beverages', fssai: true, drug: false },
  { name: 'Rohit Malhotra', shopName: 'CyberCity Wearables & Gear', city: 'Gurugram', state: 'Haryana', pin: '122001', categoryFocus: 'electronics', fssai: false, drug: false },
  { name: 'Pallavi Das', shopName: 'Odisha Handwoven Cottons', city: 'Bhubaneswar', state: 'Odisha', pin: '751001', categoryFocus: 'fashion', fssai: false, drug: false },
  { name: 'Ajay Trivedi', shopName: 'Baroda Ceramic & Tableware', city: 'Vadodara', state: 'Gujarat', pin: '390001', categoryFocus: 'vessels-kitchenware', fssai: false, drug: false },
  { name: 'Monica Fernandes', shopName: 'Goa Coastal Resortwear', city: 'Panaji', state: 'Goa', pin: '403001', categoryFocus: 'fashion', fssai: false, drug: false },
  { name: 'Vinay Kothari', shopName: 'Bikaner Dry Treats', city: 'Bikaner', state: 'Rajasthan', pin: '334001', categoryFocus: 'groceries', fssai: true, drug: false },
  { name: 'Shweta Rastogi', shopName: 'Taj Leather Works', city: 'Agra', state: 'Uttar Pradesh', pin: '282001', categoryFocus: 'fashion', fssai: false, drug: false },
  { name: 'Nikhil Nambiar', shopName: 'Calicut Crisps & Snacks', city: 'Kozhikode', state: 'Kerala', pin: '673001', categoryFocus: 'food-beverages', fssai: true, drug: false },
  { name: 'Jyoti Mishra', shopName: 'Mithila Art & Stationery', city: 'Patna', state: 'Bihar', pin: '800001', categoryFocus: 'books-stationery', fssai: false, drug: false },
  { name: 'Pradeep Rawat', shopName: 'Garhwal Herbal Organics', city: 'Rishikesh', state: 'Uttarakhand', pin: '249201', categoryFocus: 'medicines-healthcare', fssai: false, drug: true },
  { name: 'Rekha Natarajan', shopName: 'Madurai Temple Weaves', city: 'Madurai', state: 'Tamil Nadu', pin: '625001', categoryFocus: 'fashion', fssai: false, drug: false },
  { name: 'Chetan Solanki', shopName: 'Rajkot Cast Iron & Forge', city: 'Rajkot', state: 'Gujarat', pin: '360001', categoryFocus: 'vessels-kitchenware', fssai: false, drug: false },
  { name: 'Shalini Kapoor', shopName: 'Noida Kids Toys & Puzzles', city: 'Noida', state: 'Uttar Pradesh', pin: '201301', categoryFocus: 'toys-games', fssai: false, drug: false },
  { name: 'Balaji Ranganathan', shopName: 'Salem Steel & Vessels', city: 'Salem', state: 'Tamil Nadu', pin: '636001', categoryFocus: 'vessels-kitchenware', fssai: false, drug: false },
];

// 20 Realistic Buyers/Customers
const BUYERS_DATA = [
  { name: 'Aditi Rao', city: 'Bengaluru', state: 'Karnataka', pin: '560034', phone: '+919845012345', line1: '42, 4th Cross, Koramangala 3rd Block' },
  { name: 'Rohan Kapoor', city: 'New Delhi', state: 'Delhi', pin: '110017', phone: '+919811023456', line1: 'B-12, Malviya Nagar' },
  { name: 'Sneha Varma', city: 'Mumbai', state: 'Maharashtra', pin: '400050', phone: '+919820034567', line1: '102 Sea Green Apts, Bandra West' },
  { name: 'Karthik Sundaram', city: 'Chennai', state: 'Tamil Nadu', pin: '600028', phone: '+919840045678', line1: '15/3 R.K. Mutt Road, Mylapore' },
  { name: 'Diya Sengupta', city: 'Kolkata', state: 'West Bengal', pin: '700029', phone: '+919830056789', line1: '28 Southern Avenue, Lake Gardens' },
  { name: 'Varun Menon', city: 'Kochi', state: 'Kerala', pin: '682016', phone: '+919895067890', line1: '7A Olive Heights, Marine Drive' },
  { name: 'Bhavna Joshi', city: 'Ahmedabad', state: 'Gujarat', pin: '380015', phone: '+919825078901', line1: '501 Shivalik Elegance, Satellite' },
  { name: 'Rahul Namboodiri', city: 'Thiruvananthapuram', state: 'Kerala', pin: '695014', phone: '+919447089012', line1: 'T.C. 12/480, Kowdiar' },
  { name: 'Swati Kulkarni', city: 'Pune', state: 'Maharashtra', pin: '411004', phone: '+919822090123', line1: '88 Prabhat Road, Lane 4, Erandwane' },
  { name: 'Tanmay Chawla', city: 'Chandigarh', state: 'Punjab', pin: '160022', phone: '+919814001234', line1: 'House 342, Sector 22-A' },
  { name: 'Meenakshi Pillai', city: 'Coimbatore', state: 'Tamil Nadu', pin: '641002', phone: '+919443012345', line1: '64 West Venkatasamy Road, R.S. Puram' },
  { name: 'Abhinav Reddy', city: 'Hyderabad', state: 'Telangana', pin: '500033', phone: '+919849023456', line1: 'Plot 210, Road No. 36, Jubilee Hills' },
  { name: 'Riya Singhal', city: 'Jaipur', state: 'Rajasthan', pin: '302004', phone: '+919414034567', line1: '14 Govind Marg, Raja Park' },
  { name: 'Siddharth Roy', city: 'Bhubaneswar', state: 'Odisha', pin: '751024', phone: '+919437045678', line1: 'HIG-24, Jayadev Vihar' },
  { name: 'Ananya Nair', city: 'Kozhikode', state: 'Kerala', pin: '673004', phone: '+919895056789', line1: 'Green View, Ashokapuram' },
  { name: 'Mayank Tripathi', city: 'Lucknow', state: 'Uttar Pradesh', pin: '226010', phone: '+919415067890', line1: '3/15 Gomti Nagar, Vibhuti Khand' },
  { name: 'Shruti Bhatt', city: 'Dehradun', state: 'Uttarakhand', pin: '248001', phone: '+919837078901', line1: '55 Rajpur Road' },
  { name: 'Kunal Gokhale', city: 'Nagpur', state: 'Maharashtra', pin: '440010', phone: '+919823089012', line1: '40 West High Court Road, Dharampeth' },
  { name: 'Payal Deshmukh', city: 'Nashik', state: 'Maharashtra', pin: '422005', phone: '+919822091234', line1: '12 Anand Nagar, Gangapur Road' },
  { name: 'Vivek Narayanan', city: 'Madurai', state: 'Tamil Nadu', pin: '625020', phone: '+919443023456', line1: '8 KK Nagar Main Road' },
];

// 30 Realistic Delivery Agents
const AGENTS_DATA = [
  { name: 'Suresh Murugan', city: 'Chennai', phone: '+919840111001', vType: 'bike', vNum: 'TN 01 AB 1011', pins: ['600001', '600002', '600003', '600028'] },
  { name: 'Mani Kandan', city: 'Chennai', phone: '+919840111002', vType: 'scooter', vNum: 'TN 07 CD 2022', pins: ['600028', '600004', '600018', '600020'] },
  { name: 'Harish Pillai', city: 'Kochi', phone: '+919895111003', vType: 'bike', vNum: 'KL 07 EF 3033', pins: ['682001', '682011', '682016', '682020'] },
  { name: 'Rajesh Gowda', city: 'Bengaluru', phone: '+919845111004', vType: 'bike', vNum: 'KA 01 GH 4044', pins: ['560001', '560025', '560034', '560095'] },
  { name: 'Anand Joshi', city: 'Bengaluru', phone: '+919845111005', vType: 'electric', vNum: 'KA 05 JK 5055', pins: ['560038', '560076', '560068', '560100'] },
  { name: 'Vijay Shettigar', city: 'Mumbai', phone: '+919820111006', vType: 'bike', vNum: 'MH 01 LM 6066', pins: ['400001', '400002', '400020', '400050'] },
  { name: 'Prathap Yadav', city: 'Mumbai', phone: '+919820111007', vType: 'scooter', vNum: 'MH 02 NO 7077', pins: ['400051', '400053', '400058', '400069'] },
  { name: 'Vinoth Selvam', city: 'Coimbatore', phone: '+919443111008', vType: 'bike', vNum: 'TN 38 PQ 8088', pins: ['641001', '641002', '641012', '641018'] },
  { name: 'Dinesh Kumar', city: 'New Delhi', phone: '+919811111009', vType: 'bike', vNum: 'DL 01 RS 9099', pins: ['110001', '110002', '110005', '110017'] },
  { name: 'Prakash Mehra', city: 'New Delhi', phone: '+919811111010', vType: 'electric', vNum: 'DL 04 TU 1122', pins: ['110019', '110020', '110024', '110048'] },
  { name: 'Balan Nambiar', city: 'Thiruvananthapuram', phone: '+919447111011', vType: 'bike', vNum: 'KL 01 VW 2233', pins: ['695001', '695003', '695014', '695033'] },
  { name: 'Murugan Velu', city: 'Madurai', phone: '+919443111012', vType: 'bike', vNum: 'TN 58 XY 3344', pins: ['625001', '625002', '625010', '625020'] },
  { name: 'Ravi Shankar', city: 'Hyderabad', phone: '+919849111013', vType: 'scooter', vNum: 'TS 09 ZA 4455', pins: ['500001', '500003', '500028', '500033'] },
  { name: 'Selvam Durai', city: 'Salem', phone: '+919442111014', vType: 'bike', vNum: 'TN 27 BC 5566', pins: ['636001', '636004', '636007', '636016'] },
  { name: 'Ganesan Perumal', city: 'Tiruchirappalli', phone: '+919442111015', vType: 'bike', vNum: 'TN 45 DE 6677', pins: ['620001', '620002', '620018', '620020'] },
  { name: 'Ashok Patil', city: 'Pune', phone: '+919822111016', vType: 'bike', vNum: 'MH 12 FG 7788', pins: ['411001', '411004', '411014', '411038'] },
  { name: 'Chetan Shinde', city: 'Pune', phone: '+919822111017', vType: 'scooter', vNum: 'MH 14 HI 8899', pins: ['411002', '411007', '411016', '411041'] },
  { name: 'Sunil Rathore', city: 'Jaipur', phone: '+919414111018', vType: 'bike', vNum: 'RJ 14 JK 9900', pins: ['302001', '302004', '302015', '302020'] },
  { name: 'Jagdish Mali', city: 'Ahmedabad', phone: '+919825111019', vType: 'bike', vNum: 'GJ 01 LM 1212', pins: ['380001', '380006', '380015', '380054'] },
  { name: 'Rameshwar Tiwari', city: 'Lucknow', phone: '+919415111020', vType: 'bike', vNum: 'UP 32 NO 2323', pins: ['226001', '226003', '226010', '226016'] },
  { name: 'Arvind Chauhan', city: 'Chandigarh', phone: '+919814111021', vType: 'scooter', vNum: 'CH 01 PQ 3434', pins: ['160001', '160017', '160022', '160036'] },
  { name: 'Subhash Jena', city: 'Bhubaneswar', phone: '+919437111022', vType: 'bike', vNum: 'OD 02 RS 4545', pins: ['751001', '751007', '751012', '751024'] },
  { name: 'Mohan Bisht', city: 'Dehradun', phone: '+919837111023', vType: 'bike', vNum: 'UK 07 TU 5656', pins: ['248001', '248003', '248006', '248008'] },
  { name: 'Govind Sahu', city: 'Indore', phone: '+919826111024', vType: 'bike', vNum: 'MP 09 VW 6767', pins: ['452001', '452003', '452010', '452016'] },
  { name: 'Lokesh Barman', city: 'Kolkata', phone: '+919830111025', vType: 'scooter', vNum: 'WB 01 XY 7878', pins: ['700001', '700019', '700029', '700045'] },
  { name: 'Naresh Khatri', city: 'Surat', phone: '+919825111026', vType: 'bike', vNum: 'GJ 05 ZA 8989', pins: ['395001', '395003', '395007', '395009'] },
  { name: 'Santosh Das', city: 'Guwahati', phone: '+919435111027', vType: 'bike', vNum: 'AS 01 BC 9090', pins: ['781001', '781003', '781005', '781007'] },
  { name: 'Tarun Mandal', city: 'Kolkata', phone: '+919830111028', vType: 'electric', vNum: 'WB 02 DE 0101', pins: ['700064', '700091', '700102', '700156'] },
  { name: 'Umesh Pandey', city: 'Varanasi', phone: '+919415111029', vType: 'bike', vNum: 'UP 65 FG 1213', pins: ['221001', '221002', '221005', '221010'] },
  { name: 'Yogesh Solanki', city: 'Rajkot', phone: '+919824111030', vType: 'van', vNum: 'GJ 03 HI 2324', pins: ['360001', '360002', '360004', '360005'] },
];

// Curated high quality Unsplash Photography
const CATALOG_TEMPLATES = [
  // Fashion
  { name: 'Pure Mulberry Silk Zari Saree', cat: 'fashion', sub: 'womens-clothing', brand: 'Kaveri Weaves', price: 6499, mrp: 11999, img: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=900&auto=format&fit=crop&q=80', desc: 'Handwoven pure mulberry silk saree featuring traditional temple borders and opulent zari pallu. Comes with matching unstitched blouse piece.' },
  { name: 'Tailored Linen Mandarin Shirt', cat: 'fashion', sub: 'mens-clothing', brand: 'Loomcraft', price: 1499, mrp: 2499, img: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=900&auto=format&fit=crop&q=80', desc: 'Breathable 100% French flax linen shirt with refined mandarin collar, pearlized buttons, and moisture-wicking comfort.' },
  { name: 'Stretch Slim-Fit Chinos', cat: 'fashion', sub: 'mens-clothing', brand: 'Loomcraft', price: 1799, mrp: 2999, img: 'https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=900&auto=format&fit=crop&q=80', desc: 'Smart casual chinos crafted from premium cotton twill with 3% elastane for unrestricted stretch and sharp silhouette.' },
  { name: 'Embroidered Chikankari Kurta Set', cat: 'fashion', sub: 'womens-clothing', brand: 'Awadh Heritage', price: 2999, mrp: 4999, img: 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=900&auto=format&fit=crop&q=80', desc: 'Delicate hand-embroidered Lucknowi chikankari work on georgette with slip and matching palazzo pants.' },
  { name: 'Classic Chronograph Analog Watch', cat: 'fashion', sub: 'jewellery-watches', brand: 'Tickwell', price: 3999, mrp: 6999, img: 'https://images.unsplash.com/photo-1524805444758-089113d48a6d?w=900&auto=format&fit=crop&q=80', desc: 'Minimalist chronograph timepiece with stainless steel casing, mineral glass crystal, Japanese quartz movement and genuine leather strap.' },
  { name: 'Pro-Glide Lightweight Running Shoes', cat: 'fashion', sub: 'footwear', brand: 'Northpeak', price: 2799, mrp: 4499, img: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=900&auto=format&fit=crop&q=80', desc: 'Engineered mesh upper with responsive EVA midsole cushioning for distance road running and daily gym fitness.' },
  { name: 'Vintage Full-Grain Leather Weekender Bag', cat: 'fashion', sub: 'bags-accessories', brand: 'Desert Guild', price: 4299, mrp: 7499, img: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=900&auto=format&fit=crop&q=80', desc: 'Handcrafted distressed full-grain leather duffle with brass hardware, detachable shoulder strap, and shoe compartment.' },

  // Electronics & Mobiles
  { name: 'Apex 5G Flagship Smartphone 256GB', cat: 'electronics', sub: 'mobiles', brand: 'Novatech', price: 28999, mrp: 34999, img: 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=900&auto=format&fit=crop&q=80', desc: '6.7-inch 120Hz AMOLED display, Octa-Core 4nm chipset, 108MP OIS triple camera, and 5000mAh battery with 68W Turbo charging.' },
  { name: 'Spark Pro Active Noise Cancelling Headphones', cat: 'electronics', sub: 'audio-headphones', brand: 'Spark Audio', price: 4999, mrp: 8999, img: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=900&auto=format&fit=crop&q=80', desc: 'Hybrid Active Noise Cancellation, custom 40mm neodymium drivers, 50-hour battery life, and plush memory foam earcups.' },
  { name: 'UltraSlim 14 Pro Laptop 16GB / 512GB SSD', cat: 'electronics', sub: 'laptops-computers', brand: 'Novatech', price: 54999, mrp: 69999, img: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=900&auto=format&fit=crop&q=80', desc: 'Aerospace-grade aluminum chassis, 14-inch 2.8K IPS display, Intel Core i7 10-core processor, backlit keyboard, and Thunderbolt 4.' },
  { name: 'FitTrack Pro GPS Smartwatch', cat: 'electronics', sub: 'wearables', brand: 'Pulse', price: 3499, mrp: 5999, img: 'https://images.unsplash.com/photo-1575311373937-040b8e1fd5b6?w=900&auto=format&fit=crop&q=80', desc: '1.43-inch Always-on AMOLED display, standalone GPS tracking, SpO2 & 24/7 heart-rate monitoring, 100+ sport modes, 14-day battery.' },
  { name: 'BassSound 30W Waterproof Bluetooth Speaker', cat: 'electronics', sub: 'audio-headphones', brand: 'Spark Audio', price: 2499, mrp: 4499, img: 'https://images.unsplash.com/photo-1545454675-3531b543be5d?w=900&auto=format&fit=crop&q=80', desc: 'Dual passive radiators delivering punchy bass, IPX7 immersion-proof water resistance, and 24-hour non-stop battery life.' },

  // Groceries & Food
  { name: 'Royal Aged Basmati Rice 5kg', cat: 'groceries', sub: 'staples-grains', brand: 'Kaveri Organic', price: 749, mrp: 999, img: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=900&auto=format&fit=crop&q=80', desc: 'Two-year Himalayan snow-fed aged extra long grain basmati rice with exquisite aroma and fluffy non-sticky texture.' },
  { name: 'Artisanal Single-Estate CTC Assam Tea 500g', cat: 'food-beverages', sub: 'tea-coffee', brand: 'Assam Valley', price: 449, mrp: 699, img: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=900&auto=format&fit=crop&q=80', desc: 'Full-bodied malty golden tips blend sourced directly from Upper Assam tea gardens for a brisk morning brew.' },
  { name: 'Organic Cold-Pressed Groundnut Oil 1L', cat: 'groceries', sub: 'staples-grains', brand: 'Kaveri Organic', price: 299, mrp: 399, img: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=900&auto=format&fit=crop&q=80', desc: 'Traditional wood-churned (Marachekku) unrefined cold-pressed peanut oil preserving natural antioxidants and nutty flavor.' },
  { name: 'Single-Origin 72% Dark Chocolate Bar 100g', cat: 'food-beverages', sub: 'sweets-chocolates', brand: 'Malabar Confections', price: 199, mrp: 299, img: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=900&auto=format&fit=crop&q=80', desc: 'Direct-trade South Indian cacao beans gently roasted and stone-ground with raw cane sugar. Vegan and preservative-free.' },
  { name: 'Handcrafted Garam Masala Blend 200g', cat: 'groceries', sub: 'spices-masalas', brand: 'Malabar Spice', price: 189, mrp: 249, img: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=900&auto=format&fit=crop&q=80', desc: 'Slow-roasted stone-ground blend of 16 whole spices including green cardamom, mace, cinnamon, and Malabar black pepper.' },

  // Home & Kitchen
  { name: 'Pre-Seasoned Cast Iron Dosa Tawa 30cm', cat: 'vessels-kitchenware', sub: 'cookware', brand: 'Kitchen Forge', price: 1199, mrp: 1899, img: 'https://images.unsplash.com/photo-1590794056226-79ef3a8147e1?w=900&auto=format&fit=crop&q=80', desc: 'Heavy-gauge cast iron tawa with natural flaxseed oil seasoning for crispy dosas, rotis, and evenly distributed heat retention.' },
  { name: '400TC 100% Cotton Double Bedsheet Set', cat: 'home-kitchen', sub: 'bedding-linen', brand: 'Loomcraft', price: 1399, mrp: 2499, img: 'https://images.unsplash.com/photo-1616046229478-9901c5536a45?w=900&auto=format&fit=crop&q=80', desc: 'Sateen weave breathable pure combed cotton bedsheet with two pillow covers. Fade-resistant and ultra-soft against skin.' },
  { name: '3-Tier Stainless Steel Thermal Lunch Box', cat: 'vessels-kitchenware', sub: 'kitchen-containers', brand: 'Kitchen Forge', price: 699, mrp: 1199, img: 'https://images.unsplash.com/photo-1584269600464-37b1b58a9fe7?w=900&auto=format&fit=crop&q=80', desc: 'Food-grade 304 stainless steel tiffin set with double-wall vacuum insulation to keep home meals hot for 6+ hours.' },
  { name: 'Hand-Glazed Ceramic Studio Table Vase', cat: 'home-kitchen', sub: 'home-decor', brand: 'Hearth & Co', price: 799, mrp: 1299, img: 'https://images.unsplash.com/photo-1612196808214-b8e1d6145a8c?w=900&auto=format&fit=crop&q=80', desc: 'Wheel-thrown stoneware vase with reactive matte glaze and organic textured finish. Ideal for dried botanicals and florals.' },
  { name: 'Heavy Duty 750W Mixer Grinder (3 Jars)', cat: 'home-kitchen', sub: 'storage-organisation', brand: 'Kitchen Forge', price: 2999, mrp: 4999, img: 'https://images.unsplash.com/photo-1570222094114-d054a817e56b?w=900&auto=format&fit=crop&q=80', desc: 'Copper-wound 750W motor with overload protection and stainless steel blades for tough wet grinding and fine dry masalas.' },

  // Furniture
  { name: 'Ergonomic High-Back Mesh Office Chair', cat: 'furniture', sub: 'office-furniture', brand: 'Hearth & Co', price: 8499, mrp: 14999, img: 'https://images.unsplash.com/photo-1592078615290-033ee584e267?w=900&auto=format&fit=crop&q=80', desc: 'BIFMA-certified ergonomic desk chair with adaptive lumbar support, 3D armrests, synchronized tilt lock, and breathable Korean mesh.' },
  { name: 'Solid Sheesham Wood 5-Tier Bookshelf', cat: 'furniture', sub: 'storage-shelves', brand: 'Sahyadri Works', price: 6999, mrp: 11999, img: 'https://images.unsplash.com/photo-1594980596870-8aa52a78d8cd?w=900&auto=format&fit=crop&q=80', desc: 'Sturdy Indian rosewood open bookcase with honey teak lacquer finish. Load capacity 30kg per tier.' },
  { name: 'Minimalist Scandinavian Solid Wood Study Desk', cat: 'furniture', sub: 'office-furniture', brand: 'Sahyadri Works', price: 7499, mrp: 12999, img: 'https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?w=900&auto=format&fit=crop&q=80', desc: 'Clean workspace desk with dual smooth-gliding storage drawers and built-in cable management grommets.' },

  // Toys & Baby
  { name: 'Natural Wooden Building Blocks (100 Pieces)', cat: 'toys-games', sub: 'educational-toys', brand: 'Playhive', price: 899, mrp: 1499, img: 'https://images.unsplash.com/photo-1587654780291-39c9404d746b?w=900&auto=format&fit=crop&q=80', desc: 'Chemical-free natural hardwood blocks finished with non-toxic water-based paints. Encourages motor skills and creative spatial building.' },
  { name: '1000-Piece Panoramic Landscape Jigsaw Puzzle', cat: 'toys-games', sub: 'board-games-puzzles', brand: 'Playhive', price: 649, mrp: 999, img: 'https://images.unsplash.com/photo-1585366119957-e9730b6d0f60?w=900&auto=format&fit=crop&q=80', desc: 'Premium recycled cardboard puzzle with precision die-cut interlock pieces and zero glare linen finish.' },
  { name: 'Organic Calendula Baby Body Wash 300ml', cat: 'kids-baby', sub: 'baby-care', brand: 'Little Leaf', price: 349, mrp: 499, img: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=900&auto=format&fit=crop&q=80', desc: 'Tear-free hypoallergenic formula with organic calendula, chamomile, and sweet almond oil for gentle newborn skin.' },

  // Sports & Outdoors
  { name: 'Non-Slip Eco TPE 6mm Yoga Mat', cat: 'sports-fitness', sub: 'exercise-fitness', brand: 'Northpeak', price: 999, mrp: 1699, img: 'https://images.unsplash.com/photo-1601925260368-ae2f83cf8b7f?w=900&auto=format&fit=crop&q=80', desc: 'Dual-layer textured non-slip grip yoga and Pilates mat with body alignment lines and carry strap. Free from PVC and toxic phthalates.' },
  { name: 'Adjustable Quick-Select Dumbbell Pair 20kg', cat: 'sports-fitness', sub: 'exercise-fitness', brand: 'Northpeak', price: 4999, mrp: 7999, img: 'https://images.unsplash.com/photo-1584735935682-2f2b69dff9d2?w=900&auto=format&fit=crop&q=80', desc: 'Space-saving compact home gym dumbbells with turn-dial weight adjustment from 2.5kg to 10kg per dumbbell.' },

  // Beauty & Healthcare
  { name: 'Vitamin C 20% Brightening Face Serum 30ml', cat: 'beauty-personal-care', sub: 'skincare', brand: 'Botanica Glow', price: 599, mrp: 999, img: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=900&auto=format&fit=crop&q=80', desc: 'Stabilized L-Ascorbic Acid infused with Ferulic Acid and Hyaluronic Acid for radiant skin glow, dark spot reduction, and UV defense.' },
  { name: 'Cold-Pressed Argan Hair Treatment Oil 100ml', cat: 'beauty-personal-care', sub: 'haircare', brand: 'Botanica Glow', price: 699, mrp: 1199, img: 'https://images.unsplash.com/photo-1526947425960-945c6e72858f?w=900&auto=format&fit=crop&q=80', desc: 'Virgin Moroccan argan oil rich in Vitamin E to restore frizz-free shine, tame flyaways, and strengthen heat-damaged hair.' },
  { name: 'Precision Infrared Digital Thermometer', cat: 'medicines-healthcare', sub: 'health-devices', brand: 'WellNest', price: 699, mrp: 1299, img: 'https://images.unsplash.com/photo-1584017911766-d451b3d0e843?w=900&auto=format&fit=crop&q=80', desc: 'Contactless 1-second forehead temperature scanner with 3-color fever alert backlight and 32-reading memory recall.' },

  // Books & Stationery
  { name: 'Handbound Leather Travel Journal & Pen Set', cat: 'books-stationery', sub: 'notebooks-paper', brand: 'Paperly Studio', price: 649, mrp: 1099, img: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=900&auto=format&fit=crop&q=80', desc: 'Rustic genuine leather bound journal containing 200 pages of 120 GSM bleed-proof recycled cotton paper with brass pen.' },
];

async function seedEcosystem() {
  console.log('=====================================================');
  console.log('🚀 VP MART: POPULATING REALISTIC ECOSYSTEM & ACCOUNTS');
  console.log('=====================================================\n');

  await connectDb();

  // Find Admin and preserve
  const adminUser = await User.findOne({ role: 'admin' });
  if (adminUser) {
    console.log(`[OK] Existing Admin Account Preserved: ${adminUser.name} (${adminUser.email})`);
  } else {
    console.log('[WARN] No existing admin found. Please run seedAdmin.js if needed.');
  }

  // Pre-fetch Category tree
  const allCategories = await Category.find().lean();
  const catMap = new Map();
  allCategories.forEach((c) => catMap.set(c.slug, c));

  // 1. SEED 40 VENDORS
  console.log('\n--- 1. Creating 40 Sellers/Vendors ---');
  const vendorPasswordHash = await bcrypt.hash(VENDOR_PASSWORD, BCRYPT_ROUNDS);
  const createdVendors = [];

  for (let i = 0; i < VENDORS_DATA.length; i++) {
    const v = VENDORS_DATA[i];
    const email = `vendor.${v.name.toLowerCase().replace(/[^a-z0-9]+/g, '.')}@vpmart.in`;
    const phone = `+9198${(10000000 + i * 23145).toString().slice(0, 8)}`;

    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({
        name: v.name,
        email,
        phone,
        role: 'vendor',
        status: 'active',
        passwordHash: vendorPasswordHash,
        passwordChangedAt: new Date(),
      });
    }

    const slug = `${v.shopName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${user._id.toString().slice(-4)}`;
    const profile = await VendorProfile.findOneAndUpdate(
      { userId: user._id },
      {
        $set: {
          shopName: v.shopName,
          slug,
          businessName: `${v.shopName} Private Limited`,
          description: `Authorized seller on VP Mart specializing in premium ${v.categoryFocus} goods with fast dispatch from ${v.city}, ${v.state}.`,
          fssaiLicense: v.fssai ? `1002${(1000000000 + i * 9871).toString().slice(0, 10)}` : undefined,
          drugLicense: v.drug ? `DL-${v.state.slice(0, 2).toUpperCase()}-2022-${1000 + i}` : undefined,
          pickupAddress: {
            line1: `Plot ${12 + i}, Industrial Commerce Hub`,
            city: v.city,
            state: v.state,
            pincode: v.pin,
          },
          payout: {
            accountHolder: v.name,
            accountLast4: `${1000 + i}`.slice(-4),
            ifsc: 'HDFC0001234',
          },
          delivery: {
            processingDays: 1,
            shippingChargePaise: 4900,
            freeShippingAbovePaise: 99900,
            dispatchCutoffHour: 17,
          },
          submittedAt: new Date(),
        },
      },
      { upsert: true, new: true },
    );

    createdVendors.push({
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      phone: user.phone,
      shopName: v.shopName,
      city: v.city,
      state: v.state,
      password: VENDOR_PASSWORD,
      role: 'vendor',
      profileId: profile._id.toString(),
    });
  }
  console.log(`✓ 40 Sellers/Vendors configured successfully.`);

  // 2. SEED 20 BUYERS
  console.log('\n--- 2. Creating 20 Buyers/Customers ---');
  const buyerPasswordHash = await bcrypt.hash(BUYER_PASSWORD, BCRYPT_ROUNDS);
  const createdBuyers = [];

  for (let i = 0; i < BUYERS_DATA.length; i++) {
    const b = BUYERS_DATA[i];
    const email = `buyer.${b.name.toLowerCase().replace(/[^a-z0-9]+/g, '.')}@vpmart.in`;

    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({
        name: b.name,
        email,
        phone: b.phone,
        role: 'buyer',
        status: 'active',
        passwordHash: buyerPasswordHash,
        passwordChangedAt: new Date(),
      });
    }

    // Default shipping address
    await Address.findOneAndUpdate(
      { userId: user._id },
      {
        $set: {
          name: b.name,
          phone: b.phone,
          line1: b.line1,
          line2: 'Landmark: Near City Center',
          city: b.city,
          state: b.state,
          pincode: b.pin,
          label: 'Home',
          isDefault: true,
        },
      },
      { upsert: true, new: true },
    );

    createdBuyers.push({
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      phone: b.phone,
      city: b.city,
      state: b.state,
      password: BUYER_PASSWORD,
      role: 'buyer',
    });
  }
  console.log(`✓ 20 Buyers/Customers configured successfully.`);

  // 3. SEED 30 DELIVERY AGENTS
  console.log('\n--- 3. Creating 30 Delivery Agents ---');
  const agentPasswordHash = await bcrypt.hash(AGENT_PASSWORD, BCRYPT_ROUNDS);
  const createdAgents = [];

  for (let i = 0; i < AGENTS_DATA.length; i++) {
    const a = AGENTS_DATA[i];
    const email = `agent.${a.name.toLowerCase().replace(/[^a-z0-9]+/g, '.')}@vpmart.in`;

    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({
        name: a.name,
        email,
        phone: a.phone,
        role: 'delivery_agent',
        status: 'active',
        passwordHash: agentPasswordHash,
        passwordChangedAt: new Date(),
      });
    }

    const completed = 15 + (i * 7) % 65;
    const rating = 4.7 + (i % 4) * 0.1;
    const earnings = completed * 5000;

    const profile = await DeliveryAgentProfile.findOneAndUpdate(
      { userId: user._id },
      {
        $set: {
          vehicleType: a.vType,
          vehicleNumber: a.vNum,
          drivingLicense: `DL-${a.city.slice(0, 2).toUpperCase()}-2019-00${1000 + i}`,
          servicePincodes: a.pins,
          isAvailable: true,
          completedDeliveries: completed,
          rating: Number(rating.toFixed(1)),
          ratingCount: completed,
          earningsPaise: earnings,
          incentivesPaise: Math.floor(completed / 5) * 20000,
        },
      },
      { upsert: true, new: true },
    );

    createdAgents.push({
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      phone: a.phone,
      vehicleType: a.vType,
      vehicleNumber: a.vNum,
      city: a.city,
      password: AGENT_PASSWORD,
      role: 'delivery_agent',
      profileId: profile._id.toString(),
    });
  }
  console.log(`✓ 30 Delivery Agents configured successfully.`);

  // 4. POPULATE COMPREHENSIVE PRODUCT CATALOG
  console.log('\n--- 4. Populating Real Product Catalog Across Categories ---');
  const createdListings = [];

  // Create unique Brands
  const brandNames = [...new Set(CATALOG_TEMPLATES.map((t) => t.brand))];
  const brandMap = new Map();
  for (const bName of brandNames) {
    const slug = bName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const brand = await Brand.findOneAndUpdate(
      { slug },
      { $setOnInsert: { name: bName, slug, isActive: true } },
      { upsert: true, new: true },
    );
    brandMap.set(bName, brand);
  }

  // Iterate over 40 vendors and catalog items to ensure rich multi-vendor catalog
  for (let idx = 0; idx < CATALOG_TEMPLATES.length; idx++) {
    const tmpl = CATALOG_TEMPLATES[idx];
    const topCat = catMap.get(tmpl.cat);
    const subCat = tmpl.sub ? catMap.get(tmpl.sub) : null;

    if (!topCat) continue;

    const brandDoc = brandMap.get(tmpl.brand);
    const matchKey = `${tmpl.brand}|${tmpl.name}|base`.toLowerCase();

    // Create or get Product
    const product = await Product.findOneAndUpdate(
      { matchKey },
      {
        $setOnInsert: {
          name: tmpl.name,
          brandId: brandDoc?._id,
          brandName: brandDoc?.name,
          categoryId: topCat._id,
          subcategoryId: subCat?._id,
          description: tmpl.desc,
          matchKey,
          createdBy: createdVendors[idx % createdVendors.length].id,
        },
      },
      { upsert: true, new: true },
    );

    // Each product is offered by 1 to 2 distinct vendors with slight price variance
    const primaryVendor = createdVendors[idx % createdVendors.length];
    const secondaryVendor = createdVendors[(idx + 13) % createdVendors.length];

    const vendorsForProduct = [
      { v: primaryVendor, pricePaise: tmpl.price * 100, mrpPaise: tmpl.mrp * 100 },
      { v: secondaryVendor, pricePaise: Math.round(tmpl.price * 0.98) * 100, mrpPaise: tmpl.mrp * 100 },
    ];

    for (const vp of vendorsForProduct) {
      const sku = `SKU-${idx + 1}-${vp.v.id.slice(-4)}`;
      const title = tmpl.name;
      const slug = `${tmpl.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${vp.v.id.slice(-4)}`;

      const listing = await Listing.findOneAndUpdate(
        { vendorId: vp.v.id, sku },
        {
          $set: {
            productId: product._id,
            sku,
            slug,
            title,
            description: tmpl.desc,
            brandId: brandDoc?._id,
            brandName: brandDoc?.name,
            categoryId: topCat._id,
            subcategoryId: subCat?._id,
            categoryName: topCat.name,
            categorySlug: topCat.slug,
            categoryPath: subCat ? [topCat._id, subCat._id] : [topCat._id],
            gstPercent: topCat.gstPercent || 18,
            vendorName: vp.v.shopName,
            vendorSlug: vp.v.shopName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            pricePaise: vp.pricePaise,
            mrpPaise: vp.mrpPaise,
            stock: 45 + (idx * 3) % 90,
            soldCount: 20 + (idx * 5) % 80,
            viewCount: 150 + (idx * 25) % 400,
            status: 'active',
            isPublic: true,
            catActive: true,
            vendorActive: true,
            prescriptionRequired: false,
            images: [
              {
                key: `unsplash-${idx}`,
                url: tmpl.img,
                thumbUrl: `${tmpl.img}&w=400`,
                alt: tmpl.name,
              },
            ],
            ratingAvg: 4.5 + (idx % 5) * 0.1,
            ratingCount: 10 + (idx % 15),
          },
        },
        { upsert: true, new: true },
      );
      createdListings.push(listing);
    }
  }
  console.log(`✓ Populated ${createdListings.length} active listings across ${CATALOG_TEMPLATES.length} master products.`);

  // 5. SEED AUTHENTIC CUSTOMER REVIEWS
  console.log('\n--- 5. Seeding Real Customer Reviews ---');
  const reviewTitles = [
    'Outstanding quality & fast delivery!',
    'Worth every rupee, absolutely recommend',
    'Exceeded expectations, premium feel',
    'Very satisfied with this purchase',
    'Great packaging and authentic product',
  ];
  const reviewBodies = [
    'Delivered safely and securely packaged. The quality of the finish and material is truly top notch.',
    'Have been using it for a couple of weeks now and it works flawlessly. Good value for money.',
    'Exactly as described in the pictures and specifications. Will definitely order from this seller again.',
    'Impressive build quality and looks great. Very happy with the purchase on VP Mart.',
  ];

  let reviewCount = 0;
  for (let i = 0; i < Math.min(createdListings.length, 25); i++) {
    const listing = createdListings[i];
    const buyer = createdBuyers[i % createdBuyers.length];

    try {
      await Review.findOneAndUpdate(
        { listingId: listing._id, buyerId: buyer.id },
        {
          $set: {
            productId: listing.productId,
            rating: 4 + (i % 2),
            title: reviewTitles[i % reviewTitles.length],
            body: reviewBodies[i % reviewBodies.length],
            status: 'visible',
          },
        },
        { upsert: true },
      );
      reviewCount++;
    } catch {
      // duplicate reviews skipped
    }
  }
  console.log(`✓ Seeded ${reviewCount} authentic buyer reviews.`);

  // 6. SEED REAL ORDERS, SHIPMENTS & DELIVERY ASSIGNMENTS
  console.log('\n--- 6. Seeding Orders & Delivery Assignments ---');
  let orderCount = 0;
  const statuses = ['delivered', 'delivered', 'out_for_delivery', 'assigned', 'pickup_requested'];

  for (let i = 0; i < 15; i++) {
    const buyer = createdBuyers[i % createdBuyers.length];
    const listing = createdListings[i % createdListings.length];
    const vendor = createdVendors.find((v) => v.id === String(listing.vendorId)) || createdVendors[0];
    const agent = createdAgents[i % createdAgents.length];
    const orderStatus = statuses[i % statuses.length];

    const orderNumber = `VP-${20260000 + i + 1}`;
    const qty = 1 + (i % 2);
    const subtotal = listing.pricePaise * qty;
    const shipping = 4900;
    const total = subtotal + shipping;

    const buyerAddress = await Address.findOne({ userId: buyer.id }).lean();
    const addressSnap = buyerAddress || {
      name: buyer.name,
      phone: buyer.phone,
      line1: '12, Commercial Road',
      city: buyer.city,
      state: buyer.state,
      pincode: '600001',
    };

    const order = await Order.findOneAndUpdate(
      { orderNumber },
      {
        $set: {
          buyerId: buyer.id,
          orderNumber,
          status: orderStatus === 'delivered' ? 'completed' : 'confirmed',
          paymentMethod: i % 2 === 0 ? 'online' : 'cod',
          paymentStatus: orderStatus === 'delivered' ? (i % 2 === 0 ? 'successful' : 'cod_collected') : (i % 2 === 0 ? 'successful' : 'cod_pending'),
          address: addressSnap,
          subtotalPaise: subtotal,
          shippingPaise: shipping,
          taxMode: 'inclusive',
          totalPaise: total,
          placedAt: new Date(Date.now() - (i + 1) * 3600000 * 12),
          confirmedAt: new Date(Date.now() - (i + 1) * 3600000 * 10),
        },
      },
      { upsert: true, new: true },
    );

    // Shipment
    const isAssigned = ['assigned', 'out_for_delivery', 'delivered'].includes(orderStatus);
    const isDelivered = orderStatus === 'delivered';
    const isPickedUp = ['out_for_delivery', 'delivered'].includes(orderStatus);

    const shipment = await Shipment.findOneAndUpdate(
      { orderId: order._id, vendorId: vendor.id },
      {
        $set: {
          buyerId: buyer.id,
          vendorName: vendor.shopName,
          status: orderStatus,
          subtotalPaise: subtotal,
          shippingPaise: shipping,
          deliveryAgentId: isAssigned ? agent.id : undefined,
          deliveryAgentName: isAssigned ? agent.name : undefined,
          assignedAt: isAssigned ? new Date(Date.now() - (i + 1) * 3600000 * 8) : undefined,
          pickedUpAt: isPickedUp ? new Date(Date.now() - (i + 1) * 3600000 * 5) : undefined,
          deliveredAt: isDelivered ? new Date(Date.now() - (i + 1) * 3600000 * 2) : undefined,
          codAmountDuePaise: order.paymentMethod === 'cod' ? (isDelivered ? 0 : total) : 0,
          codCollected: isDelivered && order.paymentMethod === 'cod',
          pickupAddress: {
            shopName: vendor.shopName,
            address: `Industrial Commerce Hub, Sector ${1 + i}`,
            city: vendor.city,
            state: vendor.state,
            pincode: '600001',
            phone: vendor.phone,
          },
          destinationAddress: {
            name: addressSnap.name,
            phone: addressSnap.phone,
            line1: addressSnap.line1,
            city: addressSnap.city,
            state: addressSnap.state,
            pincode: addressSnap.pincode,
          },
          timeline: [
            { status: 'confirmed', at: order.placedAt, note: 'Order placed by customer' },
            ...(isAssigned ? [{ status: 'assigned', at: new Date(Date.now() - (i + 1) * 3600000 * 8), note: `Assigned to ${agent.name}` }] : []),
            ...(isPickedUp ? [{ status: 'picked_up', at: new Date(Date.now() - (i + 1) * 3600000 * 5), note: 'Package picked up from seller' }] : []),
            ...(isDelivered ? [{ status: 'delivered', at: new Date(Date.now() - (i + 1) * 3600000 * 2), note: 'Package delivered to customer' }] : []),
          ],
        },
      },
      { upsert: true, new: true },
    );

    // OrderItem
    await OrderItem.findOneAndUpdate(
      { orderId: order._id, listingId: listing._id },
      {
        $set: {
          shipmentId: shipment._id,
          buyerId: buyer.id,
          vendorId: vendor.id,
          productId: listing.productId,
          title: listing.title,
          sku: listing.sku,
          image: listing.images[0]?.url,
          unitPaise: listing.pricePaise,
          quantity: qty,
          linePaise: subtotal,
          netPaise: subtotal,
          commissionPercent: 10,
          commissionPaise: Math.round(subtotal * 0.1),
          vendorSharePaise: Math.round(subtotal * 0.9),
          status: 'active',
        },
      },
      { upsert: true },
    );

    // Payment
    await Payment.findOneAndUpdate(
      { orderId: order._id },
      {
        $set: {
          buyerId: buyer.id,
          method: order.paymentMethod,
          provider: order.paymentMethod === 'online' ? 'razorpay' : 'none',
          amountPaise: total,
          status: isDelivered ? (order.paymentMethod === 'online' ? 'successful' : 'cod_collected') : (order.paymentMethod === 'online' ? 'successful' : 'cod_pending'),
          verifiedAt: order.paymentMethod === 'online' ? order.placedAt : (isDelivered ? new Date() : undefined),
        },
      },
      { upsert: true },
    );

    orderCount++;
  }
  console.log(`✓ Seeded ${orderCount} realistic orders, shipments, items, and delivery assignments.`);

  // Invalidate catalog caches
  await catalogChanged().catch(() => {});

  // Generate Report
  const reportData = {
    summary: {
      adminCount: adminUser ? 1 : 0,
      sellersCount: createdVendors.length,
      buyersCount: createdBuyers.length,
      deliveryAgentsCount: createdAgents.length,
      totalUsersCount: (adminUser ? 1 : 0) + createdVendors.length + createdBuyers.length + createdAgents.length,
      listingsCount: createdListings.length,
      ordersCount: orderCount,
      reviewsCount: reviewCount,
    },
    admin: adminUser ? { id: adminUser._id.toString(), name: adminUser.name, email: adminUser.email, role: 'admin' } : null,
    sellers: createdVendors,
    buyers: createdBuyers,
    deliveryAgents: createdAgents,
  };

  const reportPath = path.resolve(__dirname, '../../user_accounts_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2), 'utf-8');
  console.log(`\n✓ Full JSON report saved to ${reportPath}`);

  await disconnectDb();
  console.log('\n=====================================================');
  console.log('🎉 POPULATION COMPLETE! ALL ACCOUNTS & DATA ACTIVE');
  console.log('=====================================================\n');

  return reportData;
}

seedEcosystem().catch((err) => {
  console.error('SEED ERROR:', err);
  process.exit(1);
});
