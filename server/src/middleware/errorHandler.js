const logger = require('../utils/logger');

/**
 * 全局错误处理中间件
 */
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // 记录错误日志
  logger.error(`错误: ${error.message}`, {
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.userId || 'anonymous'
  });

  // Mongoose验证错误
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message).join(', ');
    error = {
      message,
      statusCode: 400
    };
  }

  // Mongoose重复键错误
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const message = `${field}已存在`;
    error = {
      message,
      statusCode: 400
    };
  }

  // Mongoose转换错误
  if (err.name === 'CastError') {
    const message = '资源未找到';
    error = {
      message,
      statusCode: 404
    };
  }

  // JWT错误
  if (err.name === 'JsonWebTokenError') {
    const message = 'Token无效';
    error = {
      message,
      statusCode: 401
    };
  }

  // JWT过期错误
  if (err.name === 'TokenExpiredError') {
    const message = 'Token已过期';
    error = {
      message,
      statusCode: 401
    };
  }

  // 返回错误响应
  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || '服务器内部错误',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

module.exports = errorHandler;
