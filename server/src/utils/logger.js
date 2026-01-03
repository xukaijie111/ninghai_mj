const winston = require('winston');
const path = require('path');

/**
 * 日志配置
 */
class Logger {
  constructor() {
    this.logger = this.createLogger();
  }

  /**
   * 创建Winston日志器
   */
  createLogger() {
    // 日志级别
    const logLevel = process.env.LOG_LEVEL || 'info';
    
    // 日志格式
    const logFormat = winston.format.combine(
      winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
      }),
      winston.format.errors({ stack: true }),
      winston.format.printf(({ timestamp, level, message, stack }) => {
        if (stack) {
          return `${timestamp} [${level.toUpperCase()}]: ${message}\n${stack}`;
        }
        return `${timestamp} [${level.toUpperCase()}]: ${message}`;
      })
    );

    // 控制台格式（带颜色）
    const consoleFormat = winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({
        format: 'HH:mm:ss'
      }),
      winston.format.printf(({ timestamp, level, message, stack }) => {
        if (stack) {
          return `${timestamp} ${level}: ${message}\n${stack}`;
        }
        return `${timestamp} ${level}: ${message}`;
      })
    );

    // 传输器配置
    const transports = [
      // 控制台输出
      new winston.transports.Console({
        level: logLevel,
        format: consoleFormat,
        handleExceptions: true,
        handleRejections: true
      })
    ];

    // 生产环境添加文件输出
    if (process.env.NODE_ENV === 'production') {
      const logDir = path.join(__dirname, '../../logs');
      
      // 确保日志目录存在
      const fs = require('fs');
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      // 添加文件传输器
      transports.push(
        // 所有日志
        new winston.transports.File({
          filename: path.join(logDir, 'app.log'),
          level: logLevel,
          format: logFormat,
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5,
          handleExceptions: true,
          handleRejections: true
        }),
        // 错误日志
        new winston.transports.File({
          filename: path.join(logDir, 'error.log'),
          level: 'error',
          format: logFormat,
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5,
          handleExceptions: true,
          handleRejections: true
        })
      );
    }

    // 创建日志器
    const logger = winston.createLogger({
      level: logLevel,
      format: logFormat,
      transports,
      exitOnError: false
    });

    return logger;
  }

  /**
   * 信息日志
   */
  info(message, meta = {}) {
    this.logger.info(message, meta);
  }

  /**
   * 警告日志
   */
  warn(message, meta = {}) {
    this.logger.warn(message, meta);
  }

  /**
   * 错误日志
   */
  error(message, error = null) {
    if (error instanceof Error) {
      this.logger.error(message, { error: error.message, stack: error.stack });
    } else if (error) {
      this.logger.error(message, { error });
    } else {
      this.logger.error(message);
    }
  }

  /**
   * 调试日志
   */
  debug(message, meta = {}) {
    this.logger.debug(message, meta);
  }

  /**
   * 详细日志
   */
  verbose(message, meta = {}) {
    this.logger.verbose(message, meta);
  }

  /**
   * HTTP请求日志
   */
  http(message, meta = {}) {
    this.logger.http(message, meta);
  }

  /**
   * 游戏相关日志
   */
  game(message, gameData = {}) {
    this.logger.info(`[GAME] ${message}`, gameData);
  }

  /**
   * 用户相关日志
   */
  user(message, userData = {}) {
    this.logger.info(`[USER] ${message}`, userData);
  }

  /**
   * 房间相关日志
   */
  room(message, roomData = {}) {
    this.logger.info(`[ROOM] ${message}`, roomData);
  }

  /**
   * Socket相关日志
   */
  socket(message, socketData = {}) {
    this.logger.info(`[SOCKET] ${message}`, socketData);
  }

  /**
   * 数据库相关日志
   */
  database(message, dbData = {}) {
    this.logger.info(`[DATABASE] ${message}`, dbData);
  }

  /**
   * 缓存相关日志
   */
  cache(message, cacheData = {}) {
    this.logger.info(`[CACHE] ${message}`, cacheData);
  }

  /**
   * 认证相关日志
   */
  auth(message, authData = {}) {
    this.logger.info(`[AUTH] ${message}`, authData);
  }

  /**
   * 微信相关日志
   */
  wechat(message, wechatData = {}) {
    this.logger.info(`[WECHAT] ${message}`, wechatData);
  }

  /**
   * 性能监控日志
   */
  performance(message, perfData = {}) {
    this.logger.info(`[PERFORMANCE] ${message}`, perfData);
  }

  /**
   * 安全相关日志
   */
  security(message, securityData = {}) {
    this.logger.warn(`[SECURITY] ${message}`, securityData);
  }

  /**
   * 创建子日志器
   */
  child(defaultMeta) {
    return this.logger.child(defaultMeta);
  }

  /**
   * 获取原始Winston日志器
   */
  getWinstonLogger() {
    return this.logger;
  }
}

// 创建全局日志器实例
const logger = new Logger();

module.exports = logger;
