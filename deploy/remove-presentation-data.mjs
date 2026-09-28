import 'dotenv/config';
import mongoose from 'mongoose';

if(!process.env.MONGODB_URI) throw new Error('MONGODB_URI topilmadi');
await mongoose.connect(process.env.MONGODB_URI);
const db=mongoose.connection.db;

const users=db.collection('users'),courses=db.collection('courses'),resources=db.collection('resources'),assignments=db.collection('assignments'),quizzes=db.collection('quizzes'),curricula=db.collection('curriculumplans'),schedules=db.collection('schedules');

const presUsers=await users.find({externalId:/^PRES-/}).project({_id:1}).toArray();
const userIds=presUsers.map(x=>x._id);
const presCourses=await courses.find({code:/^PRES-/}).project({_id:1}).toArray();
const courseIds=presCourses.map(x=>x._id);

const result={};
result.resources=(await resources.deleteMany({courseId:{$in:courseIds}})).deletedCount;
result.assignments=(await assignments.deleteMany({courseId:{$in:courseIds}})).deletedCount;
result.quizzes=(await quizzes.deleteMany({courseId:{$in:courseIds}})).deletedCount;
result.courses=(await courses.deleteMany({_id:{$in:courseIds}})).deletedCount;
result.curricula=(await curricula.deleteMany({programCode:/^PRES-/})).deletedCount;
result.schedules=(await schedules.deleteMany({title:/^\[NAMUNA\]/,teacherId:{$in:userIds}})).deletedCount;
result.users=(await users.deleteMany({_id:{$in:userIds}})).deletedCount;

console.log(JSON.stringify({ok:true,deleted:result,note:'QDTU-MT-2026-* struktura va rasmiy manba kutubxonasi saqlandi'},null,2));
await mongoose.disconnect();
