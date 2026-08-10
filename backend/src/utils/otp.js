import bcrypt from "bcrypt"

const OTP_LENGTH = 6

const generateOtp = () => {
    return String(Math.floor(Math.random() * 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, "0")
}

const hashOtp = async (otp) => bcrypt.hash(otp, 10)

const compareOtp = async (otp, hash) => bcrypt.compare(otp, hash)

export {
    generateOtp,
    hashOtp,
    compareOtp
}
