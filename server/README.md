# 宁海麻将服务端

基于Node.js + Express + Socket.io + MongoDB + Redis构建的宁海麻将游戏服务端。

## 功能特性

- 🔐 **JWT认证系统** - 双Token机制，支持单点登录
- 🎮 **实时游戏通信** - Socket.io实现低延迟游戏交互
- 📱 **微信集成** - 支持微信公众号登录和分享
- 🛡️ **安全防护** - 限流、防作弊、数据加密
- 🔄 **断线重连** - 完善的状态同步和恢复机制
- 📊 **数据统计** - 用户游戏数据和排行榜
- 🏠 **房间管理** - 多房间支持，观战功能
- 💬 **聊天系统** - 实时聊天和表情功能

## 技术栈

- **运行环境**: Node.js 16+
- **Web框架**: Express.js
- **实时通信**: Socket.io
- **数据库**: MongoDB + Mongoose
- **缓存**: Redis
- **认证**: JWT (jsonwebtoken)
- **安全**: Helmet, CORS, 限流
- **日志**: Winston
- **验证**: Joi, express-validator

## 项目结构

```
server/
├── src/
│   ├── app.js              # 应用入口
│   ├── config/             # 配置文件
│   │   ├── database.js     # MongoDB配置
│   │   └── redis.js        # Redis配置
│   ├── controllers/        # 控制器
│   ├── middleware/         # 中间件
│   │   ├── auth.js         # 认证中间件
│   │   ├── errorHandler.js # 错误处理
│   │   └── rateLimiter.js  # 限流中间件
│   ├── models/             # 数据模型
│   │   └── User.js         # 用户模型
│   ├── routes/             # 路由
│   │   ├── auth.js         # 认证路由
│   │   ├── user.js         # 用户路由
│   │   ├── room.js         # 房间路由
│   │   ├── game.js         # 游戏路由
│   │   └── wechat.js       # 微信路由
│   ├── services/           # 业务逻辑
│   ├── socket/             # Socket处理
│   │   └── socketHandler.js # Socket事件处理
│   └── utils/              # 工具函数
│       └── logger.js       # 日志工具
├── tests/                  # 测试文件
├── logs/                   # 日志文件
├── docker/                 # Docker配置
├── package.json            # 项目配置
└── env.example             # 环境变量示例
```

## 快速开始

### 1. 环境要求

- Node.js 16.0+
- MongoDB 5.0+
- Redis 6.0+

### 2. 安装依赖

```bash
cd server
npm install
```

### 3. 环境配置

复制环境变量示例文件：

```bash
cp env.example .env
```

编辑 `.env` 文件，配置以下参数：

```bash
# 服务器配置
NODE_ENV=development
PORT=3001

# 数据库配置
MONGODB_URI=mongodb://localhost:27017/ninghai_mahjong
REDIS_URL=redis://localhost:6379

# JWT配置
JWT_SECRET=your_jwt_secret_key_here
JWT_REFRESH_SECRET=your_jwt_refresh_secret_key_here

# 微信公众号配置
WECHAT_APP_ID=your_wechat_app_id
WECHAT_APP_SECRET=your_wechat_app_secret
```

### 4. 启动服务

```bash
# 开发模式
npm run dev

# 生产模式
npm start
```

服务器将在 `http://localhost:3001` 启动。

## API文档

### 认证相关

- `POST /api/auth/wechat/login` - 微信登录
- `POST /api/auth/refresh` - 刷新Token
- `POST /api/auth/logout` - 用户登出

### 用户相关

- `GET /api/user/profile` - 获取用户信息
- `PUT /api/user/profile` - 更新用户信息
- `GET /api/user/statistics` - 获取用户统计
- `PUT /api/user/settings` - 更新用户设置

### 房间相关

- `GET /api/room/list` - 获取房间列表
- `POST /api/room/create` - 创建房间
- `POST /api/room/:roomId/join` - 加入房间
- `POST /api/room/:roomId/leave` - 离开房间
- `GET /api/room/:roomId` - 获取房间信息
- `POST /api/room/:roomId/ready` - 准备游戏

### 游戏相关

- `GET /api/game/:gameId/state` - 获取游戏状态
- `POST /api/game/:gameId/action` - 执行游戏操作
- `GET /api/game/:gameId/sync/:version` - 状态同步
- `POST /api/game/:gameId/reconnect` - 断线重连
- `GET /api/game/history` - 游戏历史

### 微信相关

- `POST /api/wechat/config` - 获取JS-SDK配置
- `POST /api/wechat/share` - 生成分享配置
- `POST /api/wechat/callback` - 微信回调

## Socket.io事件

### 客户端 → 服务端

```javascript
// 房间相关
socket.emit('room:join', { roomId })
socket.emit('room:leave', { roomId })
socket.emit('room:ready', { roomId })

// 游戏相关
socket.emit('game:action', { gameId, type, cards, targetCard })
socket.emit('game:sync_request', { gameId, version })
socket.emit('game:reconnect', { gameId })

// 聊天相关
socket.emit('chat:message', { roomId, message, type })
socket.emit('chat:emoji', { roomId, emojiId })

// 系统相关
socket.emit('heartbeat', { timestamp })
```

### 服务端 → 客户端

```javascript
// 连接状态
socket.on('connected', data => {})
socket.on('heartbeat_ack', data => {})

// 房间相关
socket.on('room:join_result', data => {})
socket.on('room:player_joined', data => {})
socket.on('room:player_left', data => {})
socket.on('room:game_start', data => {})

// 游戏相关
socket.on('game:state_update', data => {})
socket.on('game:action_result', data => {})
socket.on('game:player_action', data => {})
socket.on('game:game_end', data => {})

// 聊天相关
socket.on('chat:message', data => {})
socket.on('chat:emoji', data => {})

// 错误和断开
socket.on('error', data => {})
socket.on('force_logout', data => {})
```

## 开发指南

### 添加新的API路由

1. 在 `src/routes/` 目录下创建或编辑路由文件
2. 在 `src/app.js` 中注册路由
3. 添加相应的控制器和服务逻辑

### 添加新的Socket事件

1. 在 `src/socket/socketHandler.js` 中添加事件处理器
2. 实现相应的业务逻辑
3. 添加错误处理和日志记录

### 数据库模型

1. 在 `src/models/` 目录下创建Mongoose模型
2. 定义Schema、索引和方法
3. 在需要的地方导入使用

### 中间件开发

1. 在 `src/middleware/` 目录下创建中间件文件
2. 实现中间件逻辑
3. 在路由或应用级别使用

## 部署

### Docker部署

```bash
# 构建镜像
npm run docker:build

# 运行容器
npm run docker:run
```

### PM2部署

```bash
# 安装PM2
npm install -g pm2

# 启动应用
pm2 start src/app.js --name "ninghai-mahjong"

# 查看状态
pm2 status

# 查看日志
pm2 logs ninghai-mahjong
```

## 监控和日志

### 日志级别

- `error` - 错误信息
- `warn` - 警告信息
- `info` - 一般信息
- `http` - HTTP请求
- `debug` - 调试信息

### 日志文件

- `logs/app.log` - 所有日志
- `logs/error.log` - 错误日志

### 健康检查

访问 `GET /health` 获取服务器状态信息。

## 安全考虑

1. **认证安全**
   - JWT Token定期刷新
   - 单点登录防止多设备同时使用
   - 密钥定期更换

2. **API安全**
   - 请求限流防止滥用
   - 参数验证防止注入
   - CORS配置限制来源

3. **游戏安全**
   - 服务端验证所有操作
   - 防作弊检测
   - 异常行为监控

## 性能优化

1. **数据库优化**
   - 合理设计索引
   - 查询优化
   - 连接池管理

2. **缓存策略**
   - Redis缓存热点数据
   - 会话状态缓存
   - 查询结果缓存

3. **网络优化**
   - 数据压缩
   - 连接复用
   - 负载均衡

## 故障排除

### 常见问题

1. **数据库连接失败**
   - 检查MongoDB服务状态
   - 验证连接字符串
   - 检查网络连接

2. **Redis连接失败**
   - 检查Redis服务状态
   - 验证连接配置
   - 检查防火墙设置

3. **Socket连接问题**
   - 检查CORS配置
   - 验证认证Token
   - 检查网络代理

### 日志分析

使用以下命令查看特定类型的日志：

```bash
# 查看错误日志
tail -f logs/error.log

# 查看所有日志
tail -f logs/app.log

# 搜索特定用户的日志
grep "userId:12345" logs/app.log
```

## 贡献指南

1. Fork项目
2. 创建功能分支
3. 提交更改
4. 推送到分支
5. 创建Pull Request

## 许可证

MIT License
