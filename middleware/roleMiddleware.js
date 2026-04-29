const checkRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.roles) {
      return res.status(403).json({ message: "No roles assigned" });
    }

    const hasRole = req.roles.some((role) => allowedRoles.includes(role));

    if (!hasRole) {
      return res.status(403).json({ message: "Access denied: insufficient permissions" });
    }

    next();
  };
};

module.exports = { checkRole };
