const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

/**
 * 房间状态枚举
 */
const ROOM_STATES = {
  WAITING: 'waiting',       // 等待玩家
  READY: 'ready',          // 准备开始
  PLAYING: 'playing',      // 游戏中
  FINISHED: 'finished'     // 游戏结束
};

/**
 * 房间类型枚举
 */
const ROOM_TYPES = {
  PUBLIC: 'public',        // 公开房间
  PRIVATE: 'private'       // 私人房间
};

/**
 * 房间Schema
 */
const roomSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  roomCode: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    maxlength: 50
  },
  type: {
    type: String,
    enum: Object.values(ROOM_TYPES),
    default: ROOM_TYPES.PUBLIC
  },
  state: {
    type: String,
    enum: Object.values(ROOM_STATES),
    default: ROOM_STATES.WAITING
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  players: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    nickname: String,
    avatar: String,
    position: {
      type: Number,
      min: 0,
      max: 3
    },
    isReady: {
      type: Boolean,
      default: false
    },
    isOnline: {
      type: Boolean,
      default: true
    },
    joinTime: {
      type: Date,
      default: Date.now
    },
    lastActiveTime: {
      type: Date,
      default: Date.now
    }
  }],
  maxPlayers: {
    type: Number,
    default: 4,
    min: 2,
    max: 4
  },
  gameSettings: {
    mode: {
      type: String,
      enum: ['yao_ban_san', 'yao_ban_liu', 'tui_dao_ba', 'yao_er_liu'],
      default: 'yao_ban_san'
    },
    maxRounds: {
      type: Number,
      default: 8,
      min: 1,
      max: 16
    },
    timeLimit: {
      type: Number,
      default: 30,  // 秒
      min: 10,
      max: 120
    },
    allowReconnect: {
      type: Boolean,
      default: true
    },
    autoStart: {
      type: Boolean,
      default: false
    }
  },
  currentGame: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Game'
  },
  gameHistory: [{
    gameId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Game'
    },
    startTime: Date,
    endTime: Date,
    winner: Number,
    scores: [Number]
  }],
  password: String,  // 私人房间密码
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// 索引
roomSchema.index({ state: 1, type: 1 });
roomSchema.index({ owner: 1 });
roomSchema.index({ 'players.userId': 1 });

/**
 * 房间管理类
 */
class Room {
  constructor(roomData) {
    this.data = roomData;
  }

  /**
   * 创建房间
   */
  static async createRoom(ownerId, roomName, settings = {}) {
    const roomId = uuidv4();
    const roomCode = this.generateRoomCode();
    
    const roomData = {
      roomId,
      roomCode,
      name: roomName,
      owner: ownerId,
      players: [],
      gameSettings: {
        ...settings
      }
    };

    const room = new RoomModel(roomData);
    await room.save();
    
    return new Room(room);
  }

  /**
   * 生成6位房间号
   */
  static generateRoomCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * 加入房间
   */
  async joinRoom(userId, userInfo) {
    if (this.data.players.length >= this.data.maxPlayers) {
      throw new Error('房间已满');
    }

    if (this.data.state === ROOM_STATES.PLAYING) {
      throw new Error('游戏进行中，无法加入');
    }

    // 检查用户是否已在房间中
    const existingPlayer = this.data.players.find(p => p.userId.toString() === userId.toString());
    if (existingPlayer) {
      // 重新连接
      existingPlayer.isOnline = true;
      existingPlayer.lastActiveTime = new Date();
      await this.save();
      return existingPlayer.position;
    }

    // 找到空位置
    const occupiedPositions = this.data.players.map(p => p.position);
    let position = 0;
    while (occupiedPositions.includes(position)) {
      position++;
    }

    const player = {
      userId,
      nickname: userInfo.nickname,
      avatar: userInfo.avatar,
      position,
      isReady: false,
      isOnline: true,
      joinTime: new Date(),
      lastActiveTime: new Date()
    };

    this.data.players.push(player);
    await this.save();
    
    return position;
  }

  /**
   * 离开房间
   */
  async leaveRoom(userId) {
    const playerIndex = this.data.players.findIndex(p => p.userId.toString() === userId.toString());
    
    if (playerIndex === -1) {
      throw new Error('用户不在房间中');
    }

    if (this.data.state === ROOM_STATES.PLAYING) {
      // 游戏中只标记为离线，不移除
      this.data.players[playerIndex].isOnline = false;
      this.data.players[playerIndex].lastActiveTime = new Date();
    } else {
      // 移除玩家
      this.data.players.splice(playerIndex, 1);
      
      // 如果房主离开且还有其他玩家，转移房主
      if (this.data.owner.toString() === userId.toString() && this.data.players.length > 0) {
        this.data.owner = this.data.players[0].userId;
      }
      
      // 如果房间空了，标记为不活跃
      if (this.data.players.length === 0) {
        this.data.isActive = false;
      }
    }

    await this.save();
  }

  /**
   * 玩家准备
   */
  async playerReady(userId, isReady = true) {
    const player = this.data.players.find(p => p.userId.toString() === userId.toString());
    
    if (!player) {
      throw new Error('用户不在房间中');
    }

    player.isReady = isReady;
    player.lastActiveTime = new Date();

    // 检查是否所有玩家都准备好了
    const allReady = this.data.players.length >= 2 && 
                     this.data.players.every(p => p.isReady);

    if (allReady) {
      this.data.state = ROOM_STATES.READY;
    } else {
      this.data.state = ROOM_STATES.WAITING;
    }

    await this.save();
    
    return allReady;
  }

  /**
   * 开始游戏
   */
  async startGame() {
    if (this.data.state !== ROOM_STATES.READY) {
      throw new Error('房间状态不允许开始游戏');
    }

    if (this.data.players.length < 2) {
      throw new Error('玩家数量不足');
    }

    this.data.state = ROOM_STATES.PLAYING;
    
    // 重置玩家准备状态
    this.data.players.forEach(player => {
      player.isReady = false;
    });

    await this.save();
  }

  /**
   * 游戏结束
   */
  async gameFinished(gameResult) {
    this.data.state = ROOM_STATES.FINISHED;
    this.data.currentGame = null;
    
    // 记录游戏历史
    this.data.gameHistory.push({
      gameId: gameResult.gameId,
      startTime: gameResult.startTime,
      endTime: gameResult.endTime,
      winner: gameResult.winner,
      scores: gameResult.scores
    });

    // 重置玩家状态
    this.data.players.forEach(player => {
      player.isReady = false;
    });

    await this.save();
  }

  /**
   * 更新玩家活跃时间
   */
  async updatePlayerActivity(userId) {
    const player = this.data.players.find(p => p.userId.toString() === userId.toString());
    
    if (player) {
      player.lastActiveTime = new Date();
      player.isOnline = true;
      await this.save();
    }
  }

  /**
   * 检查房间是否可以解散
   */
  canDissolve() {
    // 游戏中的房间需要所有玩家同意才能解散
    if (this.data.state === ROOM_STATES.PLAYING) {
      return false;
    }
    
    return true;
  }

  /**
   * 解散房间
   */
  async dissolveRoom() {
    if (!this.canDissolve()) {
      throw new Error('房间无法解散');
    }

    this.data.isActive = false;
    this.data.state = ROOM_STATES.FINISHED;
    await this.save();
  }

  /**
   * 获取房间信息
   */
  getRoomInfo() {
    return {
      roomId: this.data.roomId,
      roomCode: this.data.roomCode,
      name: this.data.name,
      type: this.data.type,
      state: this.data.state,
      owner: this.data.owner,
      players: this.data.players.map(player => ({
        userId: player.userId,
        nickname: player.nickname,
        avatar: player.avatar,
        position: player.position,
        isReady: player.isReady,
        isOnline: player.isOnline,
        joinTime: player.joinTime
      })),
      maxPlayers: this.data.maxPlayers,
      gameSettings: this.data.gameSettings,
      currentGame: this.data.currentGame,
      createdAt: this.data.createdAt
    };
  }

  /**
   * 获取玩家列表
   */
  getPlayers() {
    return this.data.players.map(player => ({
      userId: player.userId,
      nickname: player.nickname,
      avatar: player.avatar,
      position: player.position,
      isReady: player.isReady,
      isOnline: player.isOnline
    }));
  }

  /**
   * 检查用户是否在房间中
   */
  hasPlayer(userId) {
    return this.data.players.some(p => p.userId.toString() === userId.toString());
  }

  /**
   * 检查用户是否为房主
   */
  isOwner(userId) {
    return this.data.owner.toString() === userId.toString();
  }

  /**
   * 保存房间数据
   */
  async save() {
    if (this.data._id) {
      await RoomModel.findByIdAndUpdate(this.data._id, this.data);
    } else {
      const room = new RoomModel(this.data);
      this.data = await room.save();
    }
  }

  /**
   * 根据房间ID查找房间
   */
  static async findByRoomId(roomId) {
    const roomData = await RoomModel.findOne({ roomId, isActive: true })
      .populate('owner', 'nickname avatar')
      .populate('players.userId', 'nickname avatar');
    
    if (!roomData) return null;
    
    return new Room(roomData);
  }

  /**
   * 根据房间号查找房间
   */
  static async findByRoomCode(roomCode) {
    const roomData = await RoomModel.findOne({ roomCode, isActive: true })
      .populate('owner', 'nickname avatar')
      .populate('players.userId', 'nickname avatar');
    
    if (!roomData) return null;
    
    return new Room(roomData);
  }

  /**
   * 获取用户的房间
   */
  static async findUserRoom(userId) {
    const roomData = await RoomModel.findOne({
      'players.userId': userId,
      isActive: true
    }).populate('owner', 'nickname avatar')
      .populate('players.userId', 'nickname avatar');
    
    if (!roomData) return null;
    
    return new Room(roomData);
  }

  /**
   * 获取公开房间列表
   */
  static async getPublicRooms(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    
    const rooms = await RoomModel.find({
      type: ROOM_TYPES.PUBLIC,
      isActive: true,
      state: { $in: [ROOM_STATES.WAITING, ROOM_STATES.READY] }
    })
    .populate('owner', 'nickname avatar')
    .populate('players.userId', 'nickname avatar')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

    return rooms.map(room => new Room(room));
  }

  /**
   * 清理不活跃的房间
   */
  static async cleanupInactiveRooms() {
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24小时前
    
    await RoomModel.updateMany({
      isActive: true,
      state: { $ne: ROOM_STATES.PLAYING },
      updatedAt: { $lt: cutoffTime }
    }, {
      isActive: false
    });
  }
}

// 创建Mongoose模型
const RoomModel = mongoose.model('Room', roomSchema);

module.exports = {
  Room,
  RoomModel,
  ROOM_STATES,
  ROOM_TYPES
};
