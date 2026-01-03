const mongoose = require('mongoose');
const { Card, CardDeck, CARD_TYPES, HUA_CARDS } = require('./Card');

/**
 * 游戏状态枚举
 */
const GAME_STATES = {
  WAITING: 'waiting',       // 等待玩家
  STARTING: 'starting',     // 开始游戏
  DEALING: 'dealing',       // 发牌中
  PLAYING: 'playing',       // 游戏中
  FINISHED: 'finished',     // 游戏结束
  PAUSED: 'paused'         // 游戏暂停
};

/**
 * 玩家动作枚举
 */
const PLAYER_ACTIONS = {
  DISCARD: 'discard',       // 出牌
  CHI: 'chi',              // 吃牌
  PENG: 'peng',            // 碰牌
  GANG: 'gang',            // 杠牌
  HU: 'hu',                // 胡牌
  PASS: 'pass'             // 过
};

/**
 * 风位枚举
 */
const FENG_POSITIONS = {
  DONG: 'dong',    // 东风
  NAN: 'nan',      // 南风
  XI: 'xi',        // 西风
  BEI: 'bei'       // 北风
};

/**
 * 游戏模式枚举（计分模式）
 */
const GAME_MODES = {
  YAO_BAN_SAN: 'yao_ban_san',    // 幺半三（30胡底）
  YAO_BAN_LIU: 'yao_ban_liu',    // 幺半六（60胡底）
  TUI_DAO_BA: 'tui_dao_ba',       // 推倒八
  YAO_ER_LIU: 'yao_er_liu'       // 幺二六（100胡底）
};

/**
 * 游戏Schema
 */
const gameSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
    index: true
  },
  players: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    position: {
      type: Number,
      required: true,
      min: 0,
      max: 3
    },
    feng: {
      type: String,
      enum: Object.values(FENG_POSITIONS),
      required: true
    },
    handCards: [String],      // 手牌ID数组
    discardedCards: [String], // 打出的牌
    exposedCards: [{          // 明牌（吃碰杠）
      type: String,           // chi, peng, gang
      cards: [String],        // 牌ID数组
      from: Number            // 来源玩家位置
    }],
    flowerCards: [String],    // 花牌
    isReady: {
      type: Boolean,
      default: false
    },
    score: {
      type: Number,
      default: 0
    }
  }],
  state: {
    type: String,
    enum: Object.values(GAME_STATES),
    default: GAME_STATES.WAITING
  },
  mode: {
    type: String,
    enum: Object.values(GAME_MODES),
    default: GAME_MODES.YAO_BAN_SAN
  },
  currentPlayer: {
    type: Number,
    default: 0
  },
  dealer: {
    type: Number,
    default: 0
  },
  round: {
    type: Number,
    default: 1
  },
  deck: [String],             // 牌堆
  lastDiscardedCard: String,  // 最后打出的牌
  lastAction: {
    type: String,
    enum: Object.values(PLAYER_ACTIONS)
  },
  gameHistory: [{
    player: Number,
    action: String,
    cards: [String],
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  settings: {
    maxRounds: {
      type: Number,
      default: 8
    },
    timeLimit: {
      type: Number,
      default: 30  // 秒
    }
  },
  startTime: Date,
  endTime: Date,
  winner: Number,
  winType: String,
  fanCount: Number,
  huCount: Number
}, {
  timestamps: true
});

/**
 * 游戏类
 */
class Game {
  constructor(gameData) {
    this.data = gameData;
    this.deck = new CardDeck();
  }

  /**
   * 初始化游戏
   */
  initialize(players, mode = GAME_MODES.YAO_BAN_SAN) {
    this.data.players = players.map((player, index) => ({
      userId: player.userId,
      position: index,
      feng: this.getFengByPosition(index),
      handCards: [],
      discardedCards: [],
      exposedCards: [],
      flowerCards: [],
      isReady: false,
      score: 0
    }));

    this.data.mode = mode;
    this.data.state = GAME_STATES.STARTING;
    this.data.currentPlayer = this.data.dealer;
    
    // 洗牌
    this.deck.shuffle();
    this.data.deck = this.deck.cards.map(card => card.id);
  }

  /**
   * 根据位置获取风位
   */
  getFengByPosition(position) {
    const fengs = [FENG_POSITIONS.DONG, FENG_POSITIONS.NAN, FENG_POSITIONS.XI, FENG_POSITIONS.BEI];
    return fengs[position];
  }

  /**
   * 发牌
   */
  dealCards() {
    this.data.state = GAME_STATES.DEALING;

    // 每人发13张牌，庄家14张
    this.data.players.forEach((player, index) => {
      const cardCount = index === this.data.dealer ? 14 : 13;
      const cards = this.deck.drawCards(cardCount);
      player.handCards = cards.map(card => card.id);
    });

    // 处理花牌补牌
    this.handleFlowerCards();
    
    this.data.state = GAME_STATES.PLAYING;
  }

  /**
   * 处理花牌补牌
   */
  handleFlowerCards() {
    let hasFlowers = true;
    
    while (hasFlowers) {
      hasFlowers = false;
      
      // 从庄家开始按逆时针顺序检查花牌
      for (let i = 0; i < 4; i++) {
        const playerIndex = (this.data.dealer + i) % 4;
        const player = this.data.players[playerIndex];
        
        // 检查手牌中的花牌
        const flowerCards = [];
        const remainingCards = [];
        
        player.handCards.forEach(cardId => {
          const card = this.getCardById(cardId);
          if (card && card.isFlower()) {
            flowerCards.push(cardId);
            hasFlowers = true;
          } else {
            remainingCards.push(cardId);
          }
        });
        
        if (flowerCards.length > 0) {
          // 移动花牌到花牌区域
          player.flowerCards.push(...flowerCards);
          player.handCards = remainingCards;
          
          // 补牌
          const newCards = this.deck.drawCards(flowerCards.length);
          player.handCards.push(...newCards.map(card => card.id));
        }
      }
    }
  }

  /**
   * 根据ID获取牌对象
   */
  getCardById(cardId) {
    const [type, value] = cardId.split('_');
    return new Card(type, parseInt(value));
  }

  /**
   * 玩家出牌
   */
  playerDiscard(playerPosition, cardId) {
    if (this.data.state !== GAME_STATES.PLAYING) {
      throw new Error('游戏未在进行中');
    }

    if (this.data.currentPlayer !== playerPosition) {
      throw new Error('不是该玩家的回合');
    }

    const player = this.data.players[playerPosition];
    const cardIndex = player.handCards.indexOf(cardId);
    
    if (cardIndex === -1) {
      throw new Error('玩家没有这张牌');
    }

    // 移除手牌并添加到弃牌区
    player.handCards.splice(cardIndex, 1);
    player.discardedCards.push(cardId);
    
    this.data.lastDiscardedCard = cardId;
    this.data.lastAction = PLAYER_ACTIONS.DISCARD;
    
    // 记录游戏历史
    this.data.gameHistory.push({
      player: playerPosition,
      action: PLAYER_ACTIONS.DISCARD,
      cards: [cardId],
      timestamp: new Date()
    });

    // 检查其他玩家是否可以吃碰杠胡
    this.checkPlayerActions(cardId);
    
    // 如果没有人要牌，轮到下一个玩家
    this.nextPlayer();
  }

  /**
   * 检查玩家可执行的动作
   */
  checkPlayerActions(discardedCardId) {
    const discardedCard = this.getCardById(discardedCardId);
    const currentPlayerPos = this.data.currentPlayer;
    
    this.data.players.forEach((player, index) => {
      if (index === currentPlayerPos) return; // 跳过出牌玩家
      
      const actions = [];
      
      // 检查胡牌
      if (this.canHu(index, discardedCardId)) {
        actions.push(PLAYER_ACTIONS.HU);
      }
      
      // 检查杠牌
      if (this.canGang(index, discardedCardId)) {
        actions.push(PLAYER_ACTIONS.GANG);
      }
      
      // 检查碰牌
      if (this.canPeng(index, discardedCardId)) {
        actions.push(PLAYER_ACTIONS.PENG);
      }
      
      // 检查吃牌（只有下家可以吃）
      if (index === (currentPlayerPos + 1) % 4 && this.canChi(index, discardedCardId)) {
        actions.push(PLAYER_ACTIONS.CHI);
      }
      
      // 如果有可执行动作，暂停游戏等待玩家选择
      if (actions.length > 0) {
        player.availableActions = actions;
      }
    });
  }

  /**
   * 检查是否可以胡牌
   */
  canHu(playerPosition, cardId = null) {
    const player = this.data.players[playerPosition];
    let testCards = [...player.handCards];
    
    if (cardId) {
      testCards.push(cardId);
    }
    
    return this.isWinningHand(testCards, player.exposedCards);
  }

  /**
   * 检查是否可以碰牌
   */
  canPeng(playerPosition, cardId) {
    const player = this.data.players[playerPosition];
    const card = this.getCardById(cardId);
    
    // 计算手牌中相同牌的数量
    const sameCards = player.handCards.filter(handCardId => {
      const handCard = this.getCardById(handCardId);
      return handCard.equals(card);
    });
    
    return sameCards.length >= 2;
  }

  /**
   * 检查是否可以杠牌
   */
  canGang(playerPosition, cardId) {
    const player = this.data.players[playerPosition];
    const card = this.getCardById(cardId);
    
    // 计算手牌中相同牌的数量
    const sameCards = player.handCards.filter(handCardId => {
      const handCard = this.getCardById(handCardId);
      return handCard.equals(card);
    });
    
    return sameCards.length >= 3;
  }

  /**
   * 检查是否可以吃牌
   */
  canChi(playerPosition, cardId) {
    const player = this.data.players[playerPosition];
    const card = this.getCardById(cardId);
    
    // 只有数字牌可以吃
    if (!card.isNumber()) return false;
    
    // 检查是否可以组成顺子
    const handCards = player.handCards.map(id => this.getCardById(id));
    
    // 检查所有可能的顺子组合
    for (let i = 0; i < handCards.length - 1; i++) {
      for (let j = i + 1; j < handCards.length; j++) {
        if (card.canFormSequence(handCards[i], handCards[j])) {
          return true;
        }
      }
    }
    
    return false;
  }

  /**
   * 检查是否为胡牌
   */
  isWinningHand(handCards, exposedCards) {
    // 简化的胡牌检查逻辑
    // 实际实现需要更复杂的算法来检查所有可能的组合
    
    // 基本检查：14张牌（包括明牌）
    const totalCards = handCards.length + exposedCards.reduce((sum, group) => sum + group.cards.length, 0);
    if (totalCards !== 14) return false;
    
    // TODO: 实现完整的胡牌检查逻辑
    // 需要检查是否符合 11,123,123,123,123 等基本牌型
    
    return false; // 临时返回false，需要完整实现
  }

  /**
   * 轮到下一个玩家
   */
  nextPlayer() {
    this.data.currentPlayer = (this.data.currentPlayer + 1) % 4;
    
    // 如果轮到的玩家需要摸牌
    if (this.deck.hasCards()) {
      const player = this.data.players[this.data.currentPlayer];
      const newCard = this.deck.drawCard();
      player.handCards.push(newCard.id);
      
      // 检查是否摸到花牌
      if (newCard.isFlower()) {
        player.flowerCards.push(newCard.id);
        player.handCards.pop(); // 移除花牌
        
        // 补牌
        if (this.deck.hasCards()) {
          const supplementCard = this.deck.drawCard();
          player.handCards.push(supplementCard.id);
        }
      }
    }
  }

  /**
   * 计算花牌番数
   */
  calculateFlowerFan(playerPosition) {
    const player = this.data.players[playerPosition];
    const playerFeng = player.feng;
    let fanCount = 0;
    
    player.flowerCards.forEach(cardId => {
      const card = this.getCardById(cardId);
      if (card.isFlower()) {
        const flowerFeng = card.getFlowerFeng();
        if (flowerFeng === playerFeng) {
          fanCount += 1;
        }
      }
    });
    
    // 检查是否有四花（梅兰菊竹或春夏秋冬）
    const flowerValues = player.flowerCards.map(cardId => this.getCardById(cardId).value);
    const hasFourSeasons = [5, 6, 7, 8].every(val => flowerValues.includes(val)); // 春夏秋冬
    const hasFourPlants = [1, 2, 3, 4].every(val => flowerValues.includes(val));  // 梅兰菊竹
    
    if (hasFourSeasons || hasFourPlants) {
      fanCount += 2;
    }
    
    return fanCount;
  }

  /**
   * 游戏结束
   */
  endGame(winner, winType, fanCount, huCount) {
    this.data.state = GAME_STATES.FINISHED;
    this.data.winner = winner;
    this.data.winType = winType;
    this.data.fanCount = fanCount;
    this.data.huCount = huCount;
    this.data.endTime = new Date();
    
    // 计算分数
    this.calculateScores();
  }

  /**
   * 计算分数
   */
  calculateScores() {
    // 根据游戏模式计算分数
    // 这里需要实现宁海麻将的复杂计分规则
    // TODO: 实现完整的计分逻辑
  }

  /**
   * 获取游戏状态快照
   */
  getGameState() {
    return {
      roomId: this.data.roomId,
      state: this.data.state,
      mode: this.data.mode,
      currentPlayer: this.data.currentPlayer,
      dealer: this.data.dealer,
      round: this.data.round,
      players: this.data.players.map(player => ({
        userId: player.userId,
        position: player.position,
        feng: player.feng,
        handCardCount: player.handCards.length,
        discardedCards: player.discardedCards,
        exposedCards: player.exposedCards,
        flowerCards: player.flowerCards,
        score: player.score
      })),
      lastDiscardedCard: this.data.lastDiscardedCard,
      remainingCards: this.deck.getRemainingCount(),
      gameHistory: this.data.gameHistory.slice(-10) // 只返回最近10条历史
    };
  }
}

// 创建Mongoose模型
const GameModel = mongoose.model('Game', gameSchema);

module.exports = {
  Game,
  GameModel,
  GAME_STATES,
  PLAYER_ACTIONS,
  FENG_POSITIONS,
  GAME_MODES
};
