# 宁海麻将技术架构文档

## 整体架构图

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   微信小游戏     │    │   Cocos Creator  │    │   Node.js服务端  │
│   运行环境       │◄──►│   客户端        │◄──►│   + Socket.io   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │                        │
                              ▼                        ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │   本地存储       │    │   MongoDB       │
                       │   + 缓存        │    │   + Redis       │
                       └─────────────────┘    └─────────────────┘
```

## 客户端架构（Cocos Creator）

### 目录结构
```
assets/
├── scenes/                 # 场景文件
│   ├── Launch.scene       # 启动场景
│   ├── Login.scene        # 登录场景
│   ├── Lobby.scene        # 大厅场景
│   └── Game.scene         # 游戏场景
├── scripts/               # 脚本文件
│   ├── managers/          # 管理器
│   │   ├── SceneManager.ts
│   │   ├── NetworkManager.ts
│   │   ├── AudioManager.ts
│   │   ├── ResourceManager.ts
│   │   └── DataManager.ts
│   ├── game/              # 游戏逻辑
│   │   ├── Card.ts
│   │   ├── Player.ts
│   │   ├── GameLogic.ts
│   │   └── MahjongRules.ts
│   ├── ui/                # UI组件
│   │   ├── components/
│   │   └── panels/
│   └── utils/             # 工具类
├── resources/             # 资源文件
│   ├── textures/          # 贴图
│   ├── audio/             # 音频
│   └── prefabs/           # 预制体
└── plugins/               # 插件
```

### 核心管理器设计

#### 1. SceneManager（场景管理器）
```typescript
class SceneManager {
    // 场景切换
    loadScene(sceneName: string, onProgress?: Function): Promise<void>
    
    // 预加载场景
    preloadScene(sceneName: string): Promise<void>
    
    // 场景数据传递
    setSceneData(data: any): void
    getSceneData(): any
}
```

#### 2. NetworkManager（网络管理器）
```typescript
class NetworkManager {
    // Socket连接管理
    connect(url: string): Promise<boolean>
    disconnect(): void
    
    // 消息发送
    emit(event: string, data: any): void
    
    // 消息监听
    on(event: string, callback: Function): void
    
    // 断线重连
    reconnect(): Promise<boolean>
}
```

#### 3. DataManager（数据管理器）
```typescript
class DataManager {
    // 用户数据
    getUserData(): UserData
    setUserData(data: UserData): void
    
    // 游戏数据
    getGameData(): GameData
    setGameData(data: GameData): void
    
    // 本地存储
    saveToLocal(key: string, data: any): void
    loadFromLocal(key: string): any
}
```

### 游戏核心类设计

#### Card（牌类）
```typescript
class Card {
    type: CardType;          // 牌类型（万、筒、索、风、箭、花）
    value: number | string;  // 牌值
    id: string;             // 唯一标识
    
    isTerminal(): boolean;   // 是否为幺九牌
    isHonor(): boolean;      // 是否为字牌
    isFlower(): boolean;     // 是否为花牌
    getDisplayName(): string; // 获取显示名称
}
```

#### Player（玩家类）
```typescript
class Player {
    id: string;             // 玩家ID
    position: number;       // 座位位置（0-3）
    handCards: Card[];      // 手牌
    discardCards: Card[];   // 弃牌
    meldCards: Meld[];      // 吃碰杠牌组
    flowerCards: Card[];    // 花牌
    
    canPlay(card: Card): boolean;     // 是否可以出牌
    canChow(cards: Card[]): boolean;  // 是否可以吃
    canPong(card: Card): boolean;     // 是否可以碰
    canKong(card: Card): boolean;     // 是否可以杠
    canWin(): boolean;                // 是否可以胡牌
}
```

## 服务端架构（Node.js）

### 目录结构
```
server/
├── src/
│   ├── controllers/       # 控制器层
│   │   ├── authController.js
│   │   ├── userController.js
│   │   ├── roomController.js
│   │   └── gameController.js
│   ├── models/           # 数据模型层
│   │   ├── User.js
│   │   ├── Room.js
│   │   ├── Game.js
│   │   └── GameRecord.js
│   ├── services/         # 业务逻辑层
│   │   ├── authService.js
│   │   ├── roomService.js
│   │   ├── gameService.js
│   │   └── mahjongService.js
│   ├── socket/           # Socket处理
│   │   ├── socketHandler.js
│   │   ├── gameSocket.js
│   │   └── roomSocket.js
│   ├── utils/            # 工具类
│   │   ├── logger.js
│   │   ├── validator.js
│   │   └── constants.js
│   ├── middleware/       # 中间件
│   │   ├── auth.js
│   │   ├── rateLimiter.js
│   │   └── errorHandler.js
│   ├── config/           # 配置文件
│   │   ├── database.js
│   │   ├── redis.js
│   │   └── wechat.js
│   └── routes/           # 路由
│       ├── auth.js
│       ├── user.js
│       ├── room.js
│       └── game.js
├── tests/                # 测试文件
├── docker/               # Docker配置
└── package.json
```

### 核心服务设计

#### GameService（游戏服务）
```javascript
class GameService {
    // 创建游戏
    createGame(roomId, players) { }
    
    // 发牌
    dealCards(gameId) { }
    
    // 玩家操作
    playerAction(gameId, playerId, action) { }
    
    // 验证操作合法性
    validateAction(gameId, playerId, action) { }
    
    // 检查胡牌
    checkWin(gameId, playerId) { }
    
    // 计算分数
    calculateScore(gameId, winData) { }
}
```

#### MahjongService（麻将规则服务）
```javascript
class MahjongService {
    // 胡牌判断
    checkWinningHand(cards) { }
    
    // 特殊牌型检查
    checkSpecialHands(cards) { }
    
    // 宁海麻将特殊规则
    checkNinghaiRules(gameState, action) { }
    
    // 计分系统
    calculateNinghaiScore(winData, scoringMode) { }
    
    // 三摊规则检查
    checkSanTanRule(player, otherPlayers) { }
}
```

### 数据库设计

#### MongoDB集合结构

**users集合**
```javascript
{
  _id: ObjectId,
  openid: String,           // 微信openid
  unionid: String,          // 微信unionid
  nickname: String,         // 昵称
  avatar: String,           // 头像
  gender: Number,           // 性别
  coins: Number,            // 游戏币
  level: Number,            // 等级
  exp: Number,              // 经验值
  statistics: {             // 统计数据
    totalGames: Number,
    winGames: Number,
    loseGames: Number,
    maxWinStreak: Number,
    currentWinStreak: Number
  },
  settings: {               // 用户设置
    soundEnabled: Boolean,
    musicEnabled: Boolean,
    vibrationEnabled: Boolean
  },
  lastLoginTime: Date,
  createdAt: Date,
  updatedAt: Date
}
```

**rooms集合**
```javascript
{
  _id: ObjectId,
  roomId: String,           // 房间号（6位数字）
  name: String,             // 房间名称
  type: String,             // 房间类型（public/private）
  maxPlayers: Number,       // 最大玩家数（固定4）
  currentPlayers: Number,   // 当前玩家数
  gameConfig: {             // 游戏配置
    scoringMode: String,    // 计分模式
    maxRounds: Number,      // 最大局数
    timeLimit: Number       // 操作时间限制
  },
  players: [{               // 玩家列表
    userId: ObjectId,
    position: Number,       // 座位位置
    isReady: Boolean,
    isOnline: Boolean
  }],
  owner: ObjectId,          // 房主
  status: String,           // 房间状态
  currentGame: ObjectId,    // 当前游戏ID
  createdAt: Date,
  updatedAt: Date
}
```

**games集合**
```javascript
{
  _id: ObjectId,
  roomId: String,
  gameNumber: Number,       // 第几局游戏
  players: [{
    userId: ObjectId,
    position: Number,
    handCards: [String],    // 手牌
    discardCards: [String], // 弃牌
    meldCards: [{           // 吃碰杠牌组
      type: String,         // chow/pong/kong
      cards: [String]
    }],
    flowerCards: [String],  // 花牌
    score: Number,          // 本局得分
    totalScore: Number,     // 总分
    isWinner: Boolean
  }],
  dealer: Number,           // 庄家位置
  currentPlayer: Number,    // 当前出牌玩家
  remainingCards: Number,   // 剩余牌数
  gameState: String,        // 游戏状态
  specialRules: {           // 特殊规则状态
    sanTanPlayers: [Number], // 三摊玩家
    firstRound: Boolean      // 是否第一圈
  },
  actions: [{               // 操作历史
    playerId: ObjectId,
    action: String,
    data: Object,
    timestamp: Date
  }],
  startTime: Date,
  endTime: Date,
  duration: Number
}
```

#### Redis缓存设计

**缓存策略**
```javascript
// 房间状态缓存
room:{roomId} = {
  players: [],
  gameState: {},
  lastUpdate: timestamp
}

// 用户在线状态
online:users = Set[userId1, userId2, ...]

// 游戏会话
game:{gameId} = {
  currentState: {},
  playerActions: [],
  timeLimit: timestamp
}

// 排行榜缓存
leaderboard:wins = SortedSet[(userId, winCount)]
leaderboard:level = SortedSet[(userId, level)]
```

## 通信协议设计

### Socket.io事件定义

#### 客户端 → 服务端
```javascript
// 房间相关
'room:create'     // 创建房间
'room:join'       // 加入房间
'room:leave'      // 离开房间
'room:ready'      // 准备游戏

// 游戏相关
'game:action'     // 游戏操作（出牌、吃碰杠等）
'game:chat'       // 聊天消息
'game:emoji'      // 表情

// 系统相关
'heartbeat'       // 心跳包
'reconnect'       // 重连请求
```

#### 服务端 → 客户端
```javascript
// 房间相关
'room:created'    // 房间创建成功
'room:joined'     // 加入房间成功
'room:playerJoined' // 其他玩家加入
'room:playerLeft' // 玩家离开
'room:gameStart'  // 游戏开始

// 游戏相关
'game:stateUpdate'  // 游戏状态更新
'game:dealCards'    // 发牌
'game:playerAction' // 玩家操作广播
'game:gameEnd'      // 游戏结束
'game:chat'         // 聊天消息广播

// 错误处理
'error'           // 错误消息
'disconnect'      // 连接断开
```

### 数据传输格式

#### 标准响应格式
```javascript
{
  success: boolean,
  data: any,
  message: string,
  timestamp: number,
  requestId: string
}
```

#### 游戏状态数据格式
```javascript
{
  gameId: string,
  roomId: string,
  currentPlayer: number,
  dealer: number,
  round: number,
  remainingCards: number,
  players: [{
    id: string,
    position: number,
    handCardCount: number,
    discardCards: [string],
    meldCards: [object],
    flowerCards: [string],
    score: number,
    isOnline: boolean
  }],
  lastAction: {
    type: string,
    playerId: string,
    data: object,
    timestamp: number
  }
}
```

## 微信小游戏适配

### 配置文件（game.json）
```json
{
  "deviceOrientation": "portrait",
  "showStatusBar": false,
  "networkTimeout": {
    "request": 10000,
    "connectSocket": 10000,
    "uploadFile": 10000,
    "downloadFile": 10000
  },
  "subpackages": [
    {
      "name": "game",
      "root": "game/",
      "pages": ["game"]
    }
  ]
}
```

### 微信API集成
```javascript
// 微信登录
wx.login({
  success: (res) => {
    // 发送code到服务端换取session_key
  }
});

// 获取用户信息
wx.getUserInfo({
  success: (res) => {
    // 获取用户昵称、头像等信息
  }
});

// 分享功能
wx.shareAppMessage({
  title: '一起来玩宁海麻将',
  imageUrl: 'share.jpg',
  query: 'roomId=123456'
});

// 监听网络状态
wx.onNetworkStatusChange((res) => {
  if (!res.isConnected) {
    // 处理网络断开
  }
});
```

## 性能优化策略

### 客户端优化
1. **资源管理**
   - 纹理压缩和合并
   - 音频压缩
   - 分包加载
   - 对象池管理

2. **渲染优化**
   - 批处理渲染
   - 减少DrawCall
   - 合理使用缓存

3. **内存管理**
   - 及时释放不用的资源
   - 避免内存泄漏
   - 监控内存使用

### 服务端优化
1. **数据库优化**
   - 合理设计索引
   - 查询优化
   - 连接池管理

2. **缓存策略**
   - Redis缓存热点数据
   - 会话状态缓存
   - 查询结果缓存

3. **并发处理**
   - 异步处理
   - 消息队列
   - 负载均衡

## 安全考虑

### 防作弊措施
1. **服务端验证**
   - 所有游戏操作服务端验证
   - 防止客户端篡改数据
   - 操作时间限制

2. **数据加密**
   - 敏感数据传输加密
   - 用户信息保护
   - 防止数据包篡改

3. **异常检测**
   - 异常操作检测
   - 频率限制
   - 自动封号机制

这个技术架构文档提供了完整的系统设计方案，涵盖了客户端、服务端、数据库、通信协议等各个方面的技术细节。
