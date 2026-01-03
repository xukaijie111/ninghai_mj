const redis = require('redis');
const logger = require('../utils/logger');

/**
 * Redis缓存连接配置
 */
class RedisClient {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  /**
   * 连接Redis
   */
  async connect() {
    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      const redisPassword = process.env.REDIS_PASSWORD;

      // Redis连接配置
      const config = {
        url: redisUrl,
        retry_strategy: (options) => {
          if (options.error && options.error.code === 'ECONNREFUSED') {
            logger.error('Redis服务器拒绝连接');
            return new Error('Redis服务器拒绝连接');
          }
          if (options.total_retry_time > 1000 * 60 * 60) {
            logger.error('Redis重连超时');
            return new Error('Redis重连超时');
          }
          if (options.attempt > 10) {
            logger.error('Redis重连次数超限');
            return undefined;
          }
          // 指数退避重连
          return Math.min(options.attempt * 100, 3000);
        },
        socket: {
          reconnectStrategy: (retries) => Math.min(retries * 50, 1000)
        }
      };

      // 如果有密码，添加密码配置
      if (redisPassword) {
        config.password = redisPassword;
      }

      // 创建Redis客户端
      this.client = redis.createClient(config);

      // 事件监听
      this.client.on('connect', () => {
        logger.info('Redis连接中...');
      });

      this.client.on('ready', () => {
        this.isConnected = true;
        logger.info('Redis连接成功');
      });

      this.client.on('error', (err) => {
        this.isConnected = false;
        logger.error('Redis连接错误:', err);
      });

      this.client.on('end', () => {
        this.isConnected = false;
        logger.warn('Redis连接断开');
      });

      this.client.on('reconnecting', () => {
        logger.info('Redis重连中...');
      });

      // 连接Redis
      await this.client.connect();

      // 测试连接
      await this.client.ping();
      logger.info('Redis连接测试成功');

    } catch (error) {
      logger.error('Redis连接失败:', error);
      throw error;
    }
  }

  /**
   * 断开Redis连接
   */
  async disconnect() {
    try {
      if (this.client) {
        await this.client.quit();
        this.isConnected = false;
        logger.info('Redis连接已关闭');
      }
    } catch (error) {
      logger.error('关闭Redis连接失败:', error);
      throw error;
    }
  }

  /**
   * 获取Redis客户端
   */
  getClient() {
    if (!this.isConnected || !this.client) {
      throw new Error('Redis未连接');
    }
    return this.client;
  }

  /**
   * 检查连接状态
   */
  isConnectedToRedis() {
    return this.isConnected && this.client && this.client.isReady;
  }

  // 常用Redis操作的封装方法

  /**
   * 设置键值对
   */
  async set(key, value, expireSeconds = null) {
    try {
      const client = this.getClient();
      const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
      
      if (expireSeconds) {
        return await client.setEx(key, expireSeconds, stringValue);
      } else {
        return await client.set(key, stringValue);
      }
    } catch (error) {
      logger.error(`Redis SET操作失败 [${key}]:`, error);
      throw error;
    }
  }

  /**
   * 获取值
   */
  async get(key) {
    try {
      const client = this.getClient();
      const value = await client.get(key);
      
      if (value === null) return null;
      
      // 尝试解析JSON
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    } catch (error) {
      logger.error(`Redis GET操作失败 [${key}]:`, error);
      throw error;
    }
  }

  /**
   * 删除键
   */
  async del(key) {
    try {
      const client = this.getClient();
      return await client.del(key);
    } catch (error) {
      logger.error(`Redis DEL操作失败 [${key}]:`, error);
      throw error;
    }
  }

  /**
   * 检查键是否存在
   */
  async exists(key) {
    try {
      const client = this.getClient();
      return await client.exists(key);
    } catch (error) {
      logger.error(`Redis EXISTS操作失败 [${key}]:`, error);
      throw error;
    }
  }

  /**
   * 设置过期时间
   */
  async expire(key, seconds) {
    try {
      const client = this.getClient();
      return await client.expire(key, seconds);
    } catch (error) {
      logger.error(`Redis EXPIRE操作失败 [${key}]:`, error);
      throw error;
    }
  }

  /**
   * 获取剩余过期时间
   */
  async ttl(key) {
    try {
      const client = this.getClient();
      return await client.ttl(key);
    } catch (error) {
      logger.error(`Redis TTL操作失败 [${key}]:`, error);
      throw error;
    }
  }

  /**
   * 哈希表操作 - 设置字段
   */
  async hset(key, field, value) {
    try {
      const client = this.getClient();
      const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
      return await client.hSet(key, field, stringValue);
    } catch (error) {
      logger.error(`Redis HSET操作失败 [${key}.${field}]:`, error);
      throw error;
    }
  }

  /**
   * 哈希表操作 - 获取字段
   */
  async hget(key, field) {
    try {
      const client = this.getClient();
      const value = await client.hGet(key, field);
      
      if (value === null) return null;
      
      // 尝试解析JSON
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    } catch (error) {
      logger.error(`Redis HGET操作失败 [${key}.${field}]:`, error);
      throw error;
    }
  }

  /**
   * 哈希表操作 - 删除字段
   */
  async hdel(key, field) {
    try {
      const client = this.getClient();
      return await client.hDel(key, field);
    } catch (error) {
      logger.error(`Redis HDEL操作失败 [${key}.${field}]:`, error);
      throw error;
    }
  }
}

// 创建Redis实例
const redisClient = new RedisClient();

// 应用退出时关闭连接
process.on('SIGINT', async () => {
  await redisClient.disconnect();
});

process.on('SIGTERM', async () => {
  await redisClient.disconnect();
});

// 导出连接函数
module.exports = async () => {
  if (!redisClient.isConnectedToRedis()) {
    await redisClient.connect();
  }
  return redisClient;
};

// 导出Redis实例
module.exports.redisClient = redisClient;
