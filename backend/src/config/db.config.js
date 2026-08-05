import mongoose from "mongoose"

const connectDB = async() => {
    try{
        const connection = await mongoose.connect(process.env.MONGO_URL)
        console.log("Database connected successfully")
    }
    catch(error){
        console.error("Database connection failed", error)
        process.exit(1)
    }
}

export default connectDB