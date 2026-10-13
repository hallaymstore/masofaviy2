import 'dotenv/config';
import mongoose from 'mongoose';
// Read-only security audit. No student, staff, or admin documents are modified.
const uri=String(process.env.MONGODB_URI||'');
if(!uri){console.error('MONGODB_URI sozlanmagan');process.exit(1)}
try{
 await mongoose.connect(uri,{serverSelectionTimeoutMS:8000});
 const users=mongoose.connection.db.collection('users');
 const patterns=[
  ['Avtomatik test o‘qituvchilari',/^QDTU-T-\d{3}$/],
  ['Avtomatik test talabalari',/^QDTU-S-\d{4}$/],
  ['Taqdimot uchun qo‘shilgan akkauntlar',/^PRES-(T|S)-/]
 ];
 let activeTotal=0;
 for(const [label,pattern] of patterns){
  const total=await users.countDocuments({externalId:pattern});
  const active=await users.countDocuments({externalId:pattern,active:true});
  activeTotal+=active;
  console.log(label+': jami='+total+', faol='+active);
 }
 console.log('Bu faqat inventarizatsiya: hech qanday akkaunt o‘chirilmadi yoki o‘zgartirilmadi.');
 if(activeTotal){console.error('XAVF: '+activeTotal+' ta faol namunaviy akkaunt aniqlandi. Vakolatli admin tekshirib o‘chirishi yoki parolini almashtirishi kerak.');process.exitCode=2}
}catch(e){console.error('Audit amalga oshmadi:',e.code||e.message);process.exitCode=1}
finally{await mongoose.disconnect().catch(()=>{})}
