const { RateLimiterRedis } = require('rate-limiter-flexible');
const { redisClient } = require('../config/redis');
const logger = require('../utils/logger');

/**
 * 限流中间件配置
 */
class RateLimiter {
  constructor() {
    this.limiters = {};
    this.initializeLimiters();
  }

  /**
   * 初始化各种限流器
   */
  async initializeLimiters() {
    try {
      // 等待Redis连接
      const redis = await require('../config/redis')();
      const client = redis.getClient();

      // 通用API限流 - 每15分钟100次请求
      this.limiters.general = new RateLimiterRedis({
        storeClient: client,
        keyPrefix: 'rl_general',
        points: 100, // 请求次数
        duration: 900, // 15分钟
        blockDuration: 900, // 阻塞15分钟
      });

      // 登录限流 - 每5分钟5次尝试
      this.limiters.login = new RateLimiterRedis({
        storeClient: client,
        keyPrefix: 'rl_login',
        points: 5,
        duration: 300, // 5分钟
        blockDuration: 900, // 阻塞15分钟
      });

      // 游戏操作限流 - 每秒10次操作
      this.limiters.gameAction = new RateLimiterRedis({
        storeClient: client,
        keyPrefix: 'rl_game_action',
        points: 10,
        duration: 1, // 1秒
        blockDuration: 10, // 阻塞10秒
      });

      // 创建房间限流 - 每小时10个房间
      this.limiters.createRoom = new RateLimiterRedis({
        storeClient: client,
        keyPrefix: 'rl_create_room',
        points: 10,
        duration: 3600, // 1小时
        blockDuration: 3600, // 阻塞1小时
      });

      // 微信API限流 - 每分钟20次
      this.limiters.wechat = new RateLimiterRedis({
        storeClient: client,
        keyPrefix: 'rl_wechat',
        points: 20,
        duration: 60, // 1分钟
        blockDuration: 300, // 阻塞5分钟
      });

      logger.info('限流器初始化成功');

    } catch (error) {
      logger.error('限流器初始化失败:', error);
      // 如果Redis不可用，使用内存限流器作为后备
      this.initializeMemoryLimiters();
    }
  }

  /**
   * 初始化内存限流器（Redis不可用时的后备方案）
   */
  initializeMemoryLimiters() {
    const { RateLimiterMemory } = require('rate-limiter-flexible');

    this.limiters.general = new RateLimiterMemory({
      keyPrefix: 'rl_general_mem',
      points: 100,
      duration: 900,
      blockDuration: 900,
    });

    this.limiters.login = new RateLimiterMemory({
      keyPrefix: 'rl_login_mem',
      points: 5,
      duration: 300,
      blockDuration: 900,
    });

    this.limiters.gameAction = new RateLimiterMemory({
      keyPrefix: 'rl_game_action_mem',
      points: 10,
      duration: 1,
      blockDuration: 10,
    });

    this.limiters.createRoom = new RateLimiterMemory({
      keyPrefix: 'rl_create_room_mem',
      points: 10,
      duration: 3600,
      blockDuration: 3600,
    });

    this.limiters.wechat = new RateLimiterMemory({
      keyPrefix: 'rl_wechat_mem',
      points: 20,
      duration: 60,
      blockDuration: 300,
    });

    logger.warn('使用内存限流器作为后备方案');
  }

  /**
   * 创建限流中间件
   */
  createMiddleware(limiterType = 'general') {
    return async (req, res, next) => {
      try {
        const limiter = this.limiters[limiterType];
        if (!limiter) {
          logger.warn(`未找到限流器: ${limiterType}`);
          return next();
        }

        // 获取客户端标识
        const key = this.getClientKey(req, limiterType);

        // 检查限流
        const resRateLimiter = await limiter.consume(key);

        // 设置响应头
        res.set({
          'X-RateLimit-Limit': limiter.points,
          'X-RateLimit-Remaining': resRateLimiter.remainingPoints,
          'X-RateLimit-Reset': new Date(Date.now() + resRateLimiter.msBeforeNext)
        });

        next();

      } catch (rejRes) {
        // 限流触发
        const secs = Math.round(rejRes.msBeforeNext / 1000) || 1;
        
        // 记录限流日志
        logger.security('触发限流', {
          limiterType,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          userId: req.user?.userId,
          url: req.originalUrl,
          method: req.method,
          blockDuration: secs
        });

        res.set({
          'X-RateLimit-Limit': this.limiters[limiterType].points,
          'X-RateLimit-Remaining': rejRes.remainingPoints || 0,
          'X-RateLimit-Reset': new Date(Date.now() + rejRes.msBeforeNext),
          'Retry-After': secs
        });

        res.status(429).json({
          success: false,
          message: `请求过于频繁，请在${secs}秒后重试`,
          retryAfter: secs
        });
      }
    };
  }

  /**
   * 获取客户端标识键
   */
  getClientKey(req, limiterType) {
    // 根据不同的限流类型使用不同的键策略
    switch (limiterType) {
      case 'login':
      case 'wechat':
        // 登录和微信API使用IP地址
        return req.ip;
      
      case 'gameAction':
      case 'createRoom':
        // 游戏操作使用用户ID（如果已登录）或IP地址
        return req.user?.userId || req.ip;
      
      default:
        // 通用限流使用IP地址
        return req.ip;
    }
  }

  /**
   * 手动重置限流
   */
  async resetLimit(key, limiterType = 'general') {
    try {
      const limiter = this.limiters[limiterType];
      if (limiter) {
        await limiter.delete(key);
        logger.info(`重置限流: ${limiterType}:${key}`);
      }
    } catch (error) {
      logger.error(`重置限流失败: ${limiterType}:${key}`, error);
    }
  }

  /**
   * 获取限流状态
   */
  async getLimitStatus(key, limiterType = 'general') {
    try {
      const limiter = this.limiters[limiterType];
      if (!limiter) return null;

      const res = await limiter.get(key);
      return {
        remainingPoints: res?.remainingPoints || limiter.points,
        msBeforeNext: res?.msBeforeNext || 0,
        totalHits: res?.totalHits || 0
      };
    } catch (error) {
      logger.error(`获取限流状态失败: ${limiterType}:${key}`, error);
      return null;
    }
  }
}

// 创建限流器实例
const rateLimiter = new RateLimiter();

// 导出中间件函数
module.exports = {
  // 通用限流
  general: () => rateLimiter.createMiddleware('general'),
  
  // 登录限流
  login: () => rateLimiter.createMiddleware('login'),
  
  // 游戏操作限流
  gameAction: () => rateLimiter.createMiddleware('gameAction'),
  
  // 创建房间限流
  createRoom: () => rateLimiter.createMiddleware('createRoom'),
  
  // 微信API限流
  wechat: () => rateLimiter.createMiddleware('wechat'),
  
  // 限流器实例
  rateLimiter
};
