const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { redisClient } = require('../config/redis');
const logger = require('../utils/logger');

/**
 * JWT认证中间件
 */
const authenticate = async (req, res, next) => {
  try {
    // 获取Token
    const authHeader = req.header('Authorization');
    const token = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : null;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: '访问被拒绝，缺少认证Token',
        code: 'NO_TOKEN'
      });
    }

    // 验证Token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token已过期',
          code: 'TOKEN_EXPIRED'
        });
      } else {
        return res.status(401).json({
          success: false,
          message: 'Token无效',
          code: 'INVALID_TOKEN'
        });
      }
    }

    // 检查Token类型
    if (decoded.type !== 'access') {
      return res.status(401).json({
        success: false,
        message: 'Token类型错误',
        code: 'INVALID_TOKEN_TYPE'
      });
    }

    // 检查设备是否仍然活跃（单点登录）
    try {
      const redis = await require('../config/redis')();
      const activeDeviceKey = `active_device:${decoded.userId}`;
      const activeDevice = await redis.get(activeDeviceKey);

      if (!activeDevice) {
        return res.status(401).json({
          success: false,
          message: '设备未激活',
          code: 'DEVICE_INACTIVE'
        });
      }

      const deviceInfo = typeof activeDevice === 'string' 
        ? JSON.parse(activeDevice) 
        : activeDevice;

      if (deviceInfo.deviceId !== decoded.deviceId) {
        return res.status(401).json({
          success: false,
          message: '您的账号已在其他设备登录',
          code: 'DEVICE_KICKED'
        });
      }

      // 更新最后活跃时间
      deviceInfo.lastActiveTime = Date.now();
      await redis.set(activeDeviceKey, deviceInfo, 30 * 24 * 60 * 60); // 30天

    } catch (redisError) {
      logger.error('Redis检查设备状态失败:', redisError);
      // Redis不可用时继续处理，但记录警告
      logger.warn('Redis不可用，跳过设备状态检查');
    }

    // 获取用户信息（可选，根据需要）
    if (req.route && req.route.path && req.route.path.includes('/user/')) {
      try {
        const user = await User.findById(decoded.userId).select('-wechatAccessToken -wechatRefreshToken');
        if (!user) {
          return res.status(401).json({
            success: false,
            message: '用户不存在',
            code: 'USER_NOT_FOUND'
          });
        }

        if (user.status !== 'active') {
          return res.status(403).json({
            success: false,
            message: '账号已被禁用',
            code: 'ACCOUNT_DISABLED'
          });
        }

        req.user = {
          ...decoded,
          userData: user
        };
      } catch (dbError) {
        logger.error('获取用户信息失败:', dbError);
        req.user = decoded;
      }
    } else {
      req.user = decoded;
    }

    next();

  } catch (error) {
    logger.error('认证中间件错误:', error);
    res.status(500).json({
      success: false,
      message: '认证过程中发生错误',
      code: 'AUTH_ERROR'
    });
  }
};

/**
 * 可选认证中间件（Token存在时验证，不存在时继续）
 */
const optionalAuth = async (req, res, next) => {
  const authHeader = req.header('Authorization');
  const token = authHeader && authHeader.startsWith('Bearer ') 
    ? authHeader.substring(7) 
    : null;

  if (!token) {
    return next();
  }

  // 如果有Token，则进行认证
  return authenticate(req, res, next);
};

/**
 * 角色权限检查中间件
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: '需要认证',
        code: 'AUTHENTICATION_REQUIRED'
      });
    }

    const userRole = req.user.role || 'player';
    
    if (!roles.includes(userRole)) {
      logger.security('权限不足', {
        userId: req.user.userId,
        userRole,
        requiredRoles: roles,
        url: req.originalUrl,
        method: req.method,
        ip: req.ip
      });

      return res.status(403).json({
        success: false,
        message: '权限不足',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    next();
  };
};

/**
 * 管理员权限检查
 */
const requireAdmin = authorize('admin');

/**
 * 游戏管理员权限检查
 */
const requireGameAdmin = authorize('admin', 'game_admin');

/**
 * 验证用户状态中间件
 */
const checkUserStatus = async (req, res, next) => {
  try {
    if (!req.user || !req.user.userId) {
      return next();
    }

    const user = await User.findById(req.user.userId).select('status');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: '用户不存在',
        code: 'USER_NOT_FOUND'
      });
    }

    if (user.status === 'banned') {
      return res.status(403).json({
        success: false,
        message: '账号已被封禁',
        code: 'ACCOUNT_BANNED'
      });
    }

    if (user.status === 'inactive') {
      return res.status(403).json({
        success: false,
        message: '账号未激活',
        code: 'ACCOUNT_INACTIVE'
      });
    }

    next();

  } catch (error) {
    logger.error('检查用户状态失败:', error);
    res.status(500).json({
      success: false,
      message: '检查用户状态失败',
      code: 'STATUS_CHECK_ERROR'
    });
  }
};

/**
 * Socket.io认证中间件
 */
const socketAuth = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    const deviceId = socket.handshake.auth.deviceId;

    if (!token) {
      return next(new Error('缺少认证Token'));
    }

    // 验证Token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      return next(new Error('Token无效或已过期'));
    }

    if (decoded.type !== 'access') {
      return next(new Error('Token类型错误'));
    }

    if (decoded.deviceId !== deviceId) {
      return next(new Error('设备ID不匹配'));
    }

    // 检查设备状态
    try {
      const redis = await require('../config/redis')();
      const activeDeviceKey = `active_device:${decoded.userId}`;
      const activeDevice = await redis.get(activeDeviceKey);

      if (!activeDevice) {
        return next(new Error('设备未激活'));
      }

      const deviceInfo = typeof activeDevice === 'string' 
        ? JSON.parse(activeDevice) 
        : activeDevice;

      if (deviceInfo.deviceId !== deviceId) {
        return next(new Error('设备已被踢出'));
      }

    } catch (redisError) {
      logger.error('Socket认证Redis检查失败:', redisError);
    }

    // 设置socket用户信息
    socket.userId = decoded.userId;
    socket.deviceId = deviceId;
    socket.openid = decoded.openid;

    logger.socket('Socket认证成功', {
      userId: decoded.userId,
      deviceId: deviceId,
      socketId: socket.id
    });

    next();

  } catch (error) {
    logger.error('Socket认证失败:', error);
    next(new Error('认证失败'));
  }
};

module.exports = {
  authenticate,
  optionalAuth,
  authorize,
  requireAdmin,
  requireGameAdmin,
  checkUserStatus,
  socketAuth
};
