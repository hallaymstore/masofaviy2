import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const login=String(process.env.ADMIN_RESET_LOGIN||'').trim().toLowerCase();
const password=String(process.env.ADMIN_RESET_PASSWORD||'');
if(!login||password.length<12)throw new Error('ADMIN_RESET_LOGIN va kamida 12 belgili ADMIN_RESET_PASSWORD kiriting');
if(!process.env.MONGODB_URI)throw new Error('MONGODB_URI topilmadi');

await mongoose.connect(process.env.MONGODB_URI);
const users=mongoose.connection.db.collection('users');
const user=await users.findOne({login});
if(!user)throw new Error('Foydalanuvchi topilmadi');
if(!['superadmin','admin'].includes(user.role))throw new Error('Faqat admin/superadmin reset qilinadi');

const passwordHash=await bcrypt.hash(password,11);
const r=await users.updateOne({_id:user._id},{$set:{passwordHash,mustChangePassword:false,active:true,updatedAt:new Date()},$inc:{sessionVersion:1}});
console.log(JSON.stringify({ok:Boolean(r.modifiedCount),login,role:user.role,sessionVersionInvalidated:true}));
await mongoose.disconnect();
