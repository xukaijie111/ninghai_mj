const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
require('dotenv').config();

// 导入配置和工具
const connectDB = require('./config/database');
const connectRedis = require('./config/redis');
const logger = require('./utils/logger');

// 导入中间件
const errorHandler = require('./middleware/errorHandler');
const rateLimiter = require('./middleware/rateLimiter');
const { socketAuth } = require('./middleware/auth');

// 导入路由
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const roomRoutes = require('./routes/room');
const gameRoutes = require('./routes/game');
const wechatRoutes = require('./routes/wechat');

// 导入Socket处理器
const socketHandler = require('./socket/socketHandler');

/**
 * 宁海麻将服务器应用
 */
class NinghaiMahjongServer {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = null;
    this.port = process.env.PORT || 3001;
  }

  /**
   * 初始化应用
   */
  async initialize() {
    try {
      // 连接数据库
      await this.connectDatabases();
      
      // 配置中间件
      this.configureMiddleware();
      
      // 配置路由
      this.configureRoutes();
      
      // 配置Socket.io
      this.configureSocket();
      
      // 配置错误处理
      this.configureErrorHandling();
      
      logger.info('服务器初始化完成');
      
    } catch (error) {
      logger.error('服务器初始化失败:', error);
      throw error;
    }
  }

  /**
   * 连接数据库
   */
  async connectDatabases() {
    try {
      // 连接MongoDB
      await connectDB();
      logger.info('MongoDB连接成功');

      // 连接Redis
      await connectRedis();
      logger.info('Redis连接成功');

    } catch (error) {
      logger.error('数据库连接失败:', error);
      throw error;
    }
  }

  /**
   * 配置中间件
   */
  configureMiddleware() {
    // 安全中间件
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "wss:", "ws:"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false
    }));

    // 压缩中间件
    this.app.use(compression());

    // CORS配置
    this.app.use(cors({
      origin: this.getAllowedOrigins(),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    }));

    // 请求日志
    this.app.use(morgan('combined', {
      stream: {
        write: (message) => logger.http(message.trim())
      },
      skip: (req) => {
        // 跳过健康检查和静态资源的日志
        return req.url === '/health' || req.url.startsWith('/static');
      }
    }));

    // 请求解析
    this.app.use(express.json({ 
      limit: '10mb',
      verify: (req, res, buf) => {
        req.rawBody = buf;
      }
    }));
    this.app.use(express.urlencoded({ 
      extended: true, 
      limit: '10mb' 
    }));

    // 信任代理（用于获取真实IP）
    this.app.set('trust proxy', 1);

    // 通用限流
    this.app.use(rateLimiter.general());

    logger.info('中间件配置完成');
  }

  /**
   * 获取允许的源
   */
  getAllowedOrigins() {
    const origins = [
      process.env.CLIENT_URL || 'http://localhost:3000',
      'http://localhost:3000',
      'http://localhost:8080',
      'https://localhost:3000',
      'https://localhost:8080'
    ];

    // 生产环境添加实际域名
    if (process.env.NODE_ENV === 'production') {
      origins.push(
        'https://yourdomain.com',
        'https://www.yourdomain.com'
      );
    }

    return origins;
  }

  /**
   * 配置路由
   */
  configureRoutes() {
    // 健康检查
    this.app.get('/health', (req, res) => {
      res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: process.env.npm_package_version || '1.0.0'
      });
    });

    // API路由
    this.app.use('/api/auth', authRoutes);
    this.app.use('/api/user', userRoutes);
    this.app.use('/api/room', roomRoutes);
    this.app.use('/api/game', gameRoutes);
    this.app.use('/api/wechat', wechatRoutes);

    // 静态文件服务（如果需要）
    if (process.env.NODE_ENV === 'production') {
      this.app.use('/static', express.static('public'));
    }

    // API文档（开发环境）
    if (process.env.NODE_ENV === 'development') {
      this.app.get('/api', (req, res) => {
        res.json({
          message: '宁海麻将API服务',
          version: '1.0.0',
          endpoints: {
            auth: '/api/auth',
            user: '/api/user',
            room: '/api/room',
            game: '/api/game',
            wechat: '/api/wechat'
          },
          websocket: '/socket.io'
        });
      });
    }

    // 404处理
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        message: 'API端点未找到',
        path: req.originalUrl
      });
    });

    logger.info('路由配置完成');
  }

  /**
   * 配置Socket.io
   */
  configureSocket() {
    this.io = socketIo(this.server, {
      cors: {
        origin: this.getAllowedOrigins(),
        methods: ['GET', 'POST'],
        credentials: true
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000,
      upgradeTimeout: 30000,
      maxHttpBufferSize: 1e6 // 1MB
    });

    // Socket认证中间件
    this.io.use(socketAuth);

    // Socket事件处理
    this.io.on('connection', (socket) => {
      logger.socket('用户连接', {
        socketId: socket.id,
        userId: socket.userId,
        deviceId: socket.deviceId
      });

      // 处理Socket事件
      socketHandler.handleConnection(socket, this.io);

      // 连接断开处理
      socket.on('disconnect', (reason) => {
        logger.socket('用户断开连接', {
          socketId: socket.id,
          userId: socket.userId,
          reason: reason
        });

        socketHandler.handleDisconnection(socket, this.io);
      });
    });

    // 将io实例添加到app中，供其他模块使用
    this.app.io = this.io;

    logger.info('Socket.io配置完成');
  }

  /**
   * 配置错误处理
   */
  configureErrorHandling() {
    // 全局错误处理中间件
    this.app.use(errorHandler);

    // 未捕获的异常处理
    process.on('uncaughtException', (err) => {
      logger.error('未捕获的异常:', err);
      this.gracefulShutdown('uncaughtException');
    });

    // 未处理的Promise拒绝
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('未处理的Promise拒绝:', { reason, promise });
      this.gracefulShutdown('unhandledRejection');
    });

    // 进程信号处理
    process.on('SIGTERM', () => {
      logger.info('收到SIGTERM信号');
      this.gracefulShutdown('SIGTERM');
    });

    process.on('SIGINT', () => {
      logger.info('收到SIGINT信号');
      this.gracefulShutdown('SIGINT');
    });

    logger.info('错误处理配置完成');
  }

  /**
   * 启动服务器
   */
  async start() {
    try {
      await this.initialize();

      this.server.listen(this.port, () => {
        logger.info(`🚀 宁海麻将服务器启动成功`);
        logger.info(`📡 服务器地址: http://localhost:${this.port}`);
        logger.info(`🌍 环境: ${process.env.NODE_ENV || 'development'}`);
        logger.info(`📊 进程ID: ${process.pid}`);
        logger.info(`💾 内存使用: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
      });

    } catch (error) {
      logger.error('服务器启动失败:', error);
      process.exit(1);
    }
  }

  /**
   * 优雅关闭
   */
  async gracefulShutdown(signal) {
    logger.info(`开始优雅关闭服务器 (${signal})...`);

    // 设置关闭超时
    const shutdownTimeout = setTimeout(() => {
      logger.error('优雅关闭超时，强制退出');
      process.exit(1);
    }, 30000); // 30秒超时

    try {
      // 停止接受新连接
      this.server.close(async () => {
        logger.info('HTTP服务器已停止接受新连接');

        try {
          // 关闭Socket.io连接
          if (this.io) {
            this.io.close();
            logger.info('Socket.io连接已关闭');
          }

          // 关闭数据库连接
          const { database } = require('./config/database');
          if (database) {
            await database.disconnect();
            logger.info('MongoDB连接已关闭');
          }

          // 关闭Redis连接
          const { redisClient } = require('./config/redis');
          if (redisClient) {
            await redisClient.disconnect();
            logger.info('Redis连接已关闭');
          }

          clearTimeout(shutdownTimeout);
          logger.info('服务器优雅关闭完成');
          process.exit(0);

        } catch (error) {
          logger.error('关闭资源时发生错误:', error);
          clearTimeout(shutdownTimeout);
          process.exit(1);
        }
      });

    } catch (error) {
      logger.error('优雅关闭过程中发生错误:', error);
      clearTimeout(shutdownTimeout);
      process.exit(1);
    }
  }
}

// 创建并启动服务器
const server = new NinghaiMahjongServer();

// 如果直接运行此文件，则启动服务器
if (require.main === module) {
  server.start();
}

module.exports = server;
