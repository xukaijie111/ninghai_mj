const mongoose = require('mongoose');
const logger = require('../utils/logger');

/**
 * MongoDB数据库连接配置
 */
class Database {
  constructor() {
    this.isConnected = false;
  }

  /**
   * 连接MongoDB数据库
   */
  async connect() {
    try {
      const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ninghai_mahjong';
      
      // MongoDB连接选项
      const options = {
        // 使用新的URL解析器
        useNewUrlParser: true,
        useUnifiedTopology: true,
        
        // 连接池配置
        maxPoolSize: 10, // 最大连接数
        minPoolSize: 5,  // 最小连接数
        maxIdleTimeMS: 30000, // 连接空闲时间
        
        // 超时配置
        serverSelectionTimeoutMS: 5000, // 服务器选择超时
        socketTimeoutMS: 45000, // Socket超时
        
        // 缓冲配置
        bufferMaxEntries: 0,
        bufferCommands: false,
        
        // 心跳配置
        heartbeatFrequencyMS: 10000,
      };

      // 连接事件监听
      mongoose.connection.on('connected', () => {
        this.isConnected = true;
        logger.info('MongoDB连接成功');
      });

      mongoose.connection.on('error', (err) => {
        this.isConnected = false;
        logger.error('MongoDB连接错误:', err);
      });

      mongoose.connection.on('disconnected', () => {
        this.isConnected = false;
        logger.warn('MongoDB连接断开');
      });

      // 应用退出时关闭连接
      process.on('SIGINT', async () => {
        await this.disconnect();
        process.exit(0);
      });

      // 连接数据库
      await mongoose.connect(mongoUri, options);
      
      logger.info(`MongoDB连接成功: ${mongoUri}`);
      
    } catch (error) {
      logger.error('MongoDB连接失败:', error);
      throw error;
    }
  }

  /**
   * 断开数据库连接
   */
  async disconnect() {
    try {
      await mongoose.connection.close();
      this.isConnected = false;
      logger.info('MongoDB连接已关闭');
    } catch (error) {
      logger.error('关闭MongoDB连接失败:', error);
      throw error;
    }
  }

  /**
   * 检查连接状态
   */
  isConnectedToDatabase() {
    return this.isConnected && mongoose.connection.readyState === 1;
  }

  /**
   * 获取数据库状态信息
   */
  getConnectionInfo() {
    return {
      readyState: mongoose.connection.readyState,
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      name: mongoose.connection.name,
      isConnected: this.isConnected
    };
  }
}

// 创建数据库实例
const database = new Database();

// 导出连接函数
module.exports = async () => {
  if (!database.isConnectedToDatabase()) {
    await database.connect();
  }
  return database;
};

// 导出数据库实例
module.exports.database = database;
