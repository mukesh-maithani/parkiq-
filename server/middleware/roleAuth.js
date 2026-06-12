/**
 * Role-Based Access Control Middleware
 * Supports 'user' and 'owner' roles only
 */

const authorize = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Authentication required.' });
        }
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ success: false, message: 'You do not have permission to perform this action.' });
        }
        next();
    };
};

const isOwner = (req, res, next) => {
    if (!req.user || req.user.role !== 'owner') {
        return res.status(403).json({ success: false, message: 'Parking owner access required.' });
    }
    next();
};

const isResourceOwner = (resourceUserIdField = 'user_id') => {
    return (req, res, next) => {
        const resourceUserId = req.params[resourceUserIdField] || req.body[resourceUserIdField];
        if (req.user.id !== parseInt(resourceUserId)) {
            return res.status(403).json({ success: false, message: 'You can only access your own resources.' });
        }
        next();
    };
};

module.exports = { authorize, isOwner, isResourceOwner };
