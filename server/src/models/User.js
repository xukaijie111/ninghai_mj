const mongoose = require('mongoose');

/**
 * 用户数据模型
 */
const userSchema = new mongoose.Schema({
  // 微信信息
  openid: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  unionid: {
    type: String,
    sparse: true,
    index: true
  },
  
  // 用户基本信息
  phoneNumber: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  nickname: {
    type: String,
    required: true,
    maxlength: 50
  },
  avatar: {
    type: String,
    default: ''
  },
  gender: {
    type: Number,
    enum: [0, 1, 2], // 0-未知, 1-男, 2-女
    default: 0
  },
  
  // 地理信息
  city: String,
  province: String,
  country: String,
  
  // 游戏数据
  coins: {
    type: Number,
    default: 1000,
    min: 0
  },
  level: {
    type: Number,
    default: 1,
    min: 1
  },
  exp: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // 统计数据
  statistics: {
    totalGames: { type: Number, default: 0 },
    winGames: { type: Number, default: 0 },
    loseGames: { type: Number, default: 0 },
    maxWinStreak: { type: Number, default: 0 },
    currentWinStreak: { type: Number, default: 0 },
    totalPlayTime: { type: Number, default: 0 }, // 总游戏时长(分钟)
  },
  
  // 用户设置
  settings: {
    soundEnabled: { type: Boolean, default: true },
    musicEnabled: { type: Boolean, default: true },
    vibrationEnabled: { type: Boolean, default: true },
    autoPlay: { type: Boolean, default: false }
  },
  
  // 状态信息
  status: {
    type: String,
    enum: ['active', 'banned', 'inactive'],
    default: 'active'
  },
  lastLoginTime: {
    type: Date,
    default: Date.now
  },
  lastActiveTime: {
    type: Date,
    default: Date.now
  },
  
  // 微信相关
  wechatAccessToken: String,
  wechatRefreshToken: String,
  
}, {
  timestamps: true, // 自动添加createdAt和updatedAt
  versionKey: false
});

// 索引
userSchema.index({ phoneNumber: 1 });
userSchema.index({ openid: 1 });
userSchema.index({ unionid: 1 }, { sparse: true });
userSchema.index({ lastActiveTime: -1 });
userSchema.index({ 'statistics.totalGames': -1 });
userSchema.index({ level: -1 });

// 虚拟字段 - 胜率
userSchema.virtual('winRate').get(function() {
  if (this.statistics.totalGames === 0) return 0;
  return Math.round((this.statistics.winGames / this.statistics.totalGames) * 100);
});

// 实例方法 - 更新最后活跃时间
userSchema.methods.updateLastActive = function() {
  this.lastActiveTime = new Date();
  return this.save();
};

// 实例方法 - 增加游戏币
userSchema.methods.addCoins = function(amount) {
  this.coins = Math.max(0, this.coins + amount);
  return this.save();
};

// 实例方法 - 扣除游戏币
userSchema.methods.deductCoins = function(amount) {
  if (this.coins < amount) {
    throw new Error('游戏币不足');
  }
  this.coins -= amount;
  return this.save();
};

// 实例方法 - 更新游戏统计
userSchema.methods.updateGameStats = function(isWin, playTime = 0) {
  this.statistics.totalGames += 1;
  this.statistics.totalPlayTime += playTime;
  
  if (isWin) {
    this.statistics.winGames += 1;
    this.statistics.currentWinStreak += 1;
    this.statistics.maxWinStreak = Math.max(
      this.statistics.maxWinStreak, 
      this.statistics.currentWinStreak
    );
  } else {
    this.statistics.loseGames += 1;
    this.statistics.currentWinStreak = 0;
  }
  
  return this.save();
};

// 静态方法 - 根据手机号查找或创建用户
userSchema.statics.findOrCreateByPhone = async function(phoneNumber, wechatInfo) {
  let user = await this.findOne({ phoneNumber });
  
  if (!user) {
    // 创建新用户
    user = new this({
      phoneNumber,
      openid: wechatInfo.openid,
      unionid: wechatInfo.unionid,
      nickname: wechatInfo.nickname || `用户${phoneNumber.slice(-4)}`,
      avatar: wechatInfo.avatar || '',
      gender: wechatInfo.gender || 0,
      city: wechatInfo.city || '',
      province: wechatInfo.province || '',
      country: wechatInfo.country || '',
      wechatAccessToken: wechatInfo.wechatAccessToken,
      wechatRefreshToken: wechatInfo.wechatRefreshToken
    });
    
    await user.save();
    console.log(`创建新用户: ${phoneNumber}, openid: ${wechatInfo.openid}`);
  } else {
    // 更新现有用户的微信信息
    user.openid = wechatInfo.openid;
    user.unionid = wechatInfo.unionid || user.unionid;
    user.nickname = wechatInfo.nickname || user.nickname;
    user.avatar = wechatInfo.avatar || user.avatar;
    user.lastLoginTime = new Date();
    user.wechatAccessToken = wechatInfo.wechatAccessToken;
    user.wechatRefreshToken = wechatInfo.wechatRefreshToken;
    
    await user.save();
    console.log(`更新用户信息: ${phoneNumber}, openid: ${wechatInfo.openid}`);
  }
  
  return user;
};

// 静态方法 - 获取排行榜
userSchema.statics.getLeaderboard = async function(type = 'winRate', limit = 100) {
  let sortField;
  
  switch (type) {
    case 'winRate':
      // 按胜率排序（至少玩过10局）
      return await this.aggregate([
        { $match: { 'statistics.totalGames': { $gte: 10 } } },
        {
          $addFields: {
            winRate: {
              $multiply: [
                { $divide: ['$statistics.winGames', '$statistics.totalGames'] },
                100
              ]
            }
          }
        },
        { $sort: { winRate: -1, 'statistics.totalGames': -1 } },
        { $limit: limit },
        {
          $project: {
            nickname: 1,
            avatar: 1,
            level: 1,
            winRate: 1,
            'statistics.totalGames': 1,
            'statistics.winGames': 1
          }
        }
      ]);
      
    case 'level':
      sortField = { level: -1, exp: -1 };
      break;
      
    case 'totalGames':
      sortField = { 'statistics.totalGames': -1 };
      break;
      
    default:
      sortField = { 'statistics.winGames': -1 };
  }
  
  return await this.find({ status: 'active' })
    .sort(sortField)
    .limit(limit)
    .select('nickname avatar level statistics.totalGames statistics.winGames')
    .lean();
};

module.exports = mongoose.model('User', userSchema);
