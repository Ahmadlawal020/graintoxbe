// const jwt = require("jsonwebtoken");

// const verifyJWT = (req, res, next) => {
//   const authHeader = req.headers.authorization || req.headers.Authorization;

//   if (!authHeader?.startsWith("Bearer ")) {
//     return res.status(401).json({ message: "Unauthorized" });
//   }

//   const token = authHeader.split(" ")[1];

//   jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
//     if (err) return res.status(403).json({ message: "Forbidden" });
//     req.user = decoded.UserInfo.email;
//     req.roles = decoded.UserInfo.roles;
//     next();
//   });
// };

// module.exports = verifyJWT;

const jwt = require("jsonwebtoken");
const User = require("../models/userSchema");

const verifyJWT = async (req, res, next) => {
  const authHeader = req.headers.authorization || req.headers.Authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    const tokenUser = decoded?.UserInfo;

    if (!tokenUser?.id) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const dbUser = await User.findById(tokenUser.id)
      .select("email firstName lastName role status isActive")
      .lean();

    if (!dbUser || dbUser.status === "Suspended" || dbUser.isActive === false) {
      return res.status(403).json({ message: "Account is not active" });
    }

    req.user = {
      _id: dbUser._id.toString(),
      email: dbUser.email,
      firstName: dbUser.firstName,
      lastName: dbUser.lastName,
    };
    req.roles = Array.isArray(dbUser.role) ? dbUser.role : [dbUser.role];
    
    next();
  } catch (err) {
    console.error("JWT verification error:", err);
    return res.status(403).json({ message: "Forbidden" });
  }
};


module.exports = verifyJWT;
