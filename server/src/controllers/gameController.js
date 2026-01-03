const { Game, GameModel, GAME_STATES, PLAYER_ACTIONS } = require('../models/Game');
const { Room, ROOM_STATES } = require('../models/Room');
const logger = require('../utils/logger');

/**
 * 游戏控制器
 */
class GameController {
  
  /**
   * 创建新游戏
   */
  static async createGame(req, res) {
    try {
      const { roomId } = req.body;
      const userId = req.user.id;

      // 查找房间
      const room = await Room.findByRoomId(roomId);
      if (!room) {
        return res.status(404).json({
          success: false,
          message: '房间不存在'
        });
      }

      // 检查用户是否在房间中
      if (!room.hasPlayer(userId)) {
        return res.status(403).json({
          success: false,
          message: '您不在此房间中'
        });
      }

      // 检查房间状态
      if (room.data.state !== ROOM_STATES.READY) {
        return res.status(400).json({
          success: false,
          message: '房间状态不允许开始游戏'
        });
      }

      // 创建游戏
      const gameData = new GameModel({
        roomId: roomId,
        players: room.getPlayers().map((player, index) => ({
          userId: player.userId,
          position: index,
          feng: this.getFengByPosition(index),
          handCards: [],
          discardedCards: [],
          exposedCards: [],
          flowerCards: [],
          isReady: false,
          score: 0
        })),
        mode: room.data.gameSettings.mode,
        settings: {
          maxRounds: room.data.gameSettings.maxRounds,
          timeLimit: room.data.gameSettings.timeLimit
        }
      });

      await gameData.save();

      // 初始化游戏逻辑
      const game = new Game(gameData);
      game.initialize(room.getPlayers(), room.data.gameSettings.mode);
      
      // 发牌
      game.dealCards();
      
      // 保存游戏状态
      await gameData.save();

      // 更新房间状态
      room.data.currentGame = gameData._id;
      await room.startGame();

      logger.info(`游戏创建成功: ${gameData._id}, 房间: ${roomId}`);

      res.json({
        success: true,
        data: {
          gameId: gameData._id,
          gameState: game.getGameState()
        }
      });

    } catch (error) {
      logger.error('创建游戏失败:', error);
      res.status(500).json({
        success: false,
        message: '创建游戏失败',
        error: error.message
      });
    }
  }

  /**
   * 获取游戏状态
   */
  static async getGameState(req, res) {
    try {
      const { gameId } = req.params;
      const userId = req.user.id;

      const gameData = await GameModel.findById(gameId);
      if (!gameData) {
        return res.status(404).json({
          success: false,
          message: '游戏不存在'
        });
      }

      // 检查用户是否在游戏中
      const player = gameData.players.find(p => p.userId.toString() === userId.toString());
      if (!player) {
        return res.status(403).json({
          success: false,
          message: '您不在此游戏中'
        });
      }

      const game = new Game(gameData);
      const gameState = game.getGameState();

      // 为当前玩家添加手牌信息
      gameState.myCards = player.handCards;
      gameState.myPosition = player.position;

      res.json({
        success: true,
        data: gameState
      });

    } catch (error) {
      logger.error('获取游戏状态失败:', error);
      res.status(500).json({
        success: false,
        message: '获取游戏状态失败',
        error: error.message
      });
    }
  }

  /**
   * 玩家出牌
   */
  static async playerDiscard(req, res) {
    try {
      const { gameId } = req.params;
      const { cardId } = req.body;
      const userId = req.user.id;

      const gameData = await GameModel.findById(gameId);
      if (!gameData) {
        return res.status(404).json({
          success: false,
          message: '游戏不存在'
        });
      }

      // 检查用户是否在游戏中
      const player = gameData.players.find(p => p.userId.toString() === userId.toString());
      if (!player) {
        return res.status(403).json({
          success: false,
          message: '您不在此游戏中'
        });
      }

      const game = new Game(gameData);
      
      // 执行出牌操作
      game.playerDiscard(player.position, cardId);
      
      // 保存游戏状态
      await gameData.save();

      logger.info(`玩家出牌: ${userId}, 游戏: ${gameId}, 牌: ${cardId}`);

      res.json({
        success: true,
        data: {
          gameState: game.getGameState(),
          action: PLAYER_ACTIONS.DISCARD,
          cardId: cardId
        }
      });

    } catch (error) {
      logger.error('玩家出牌失败:', error);
      res.status(500).json({
        success: false,
        message: error.message || '出牌失败'
      });
    }
  }

  /**
   * 玩家吃牌
   */
  static async playerChi(req, res) {
    try {
      const { gameId } = req.params;
      const { cardIds } = req.body; // 包含要吃的牌和手牌中的两张牌
      const userId = req.user.id;

      const gameData = await GameModel.findById(gameId);
      if (!gameData) {
        return res.status(404).json({
          success: false,
          message: '游戏不存在'
        });
      }

      const player = gameData.players.find(p => p.userId.toString() === userId.toString());
      if (!player) {
        return res.status(403).json({
          success: false,
          message: '您不在此游戏中'
        });
      }

      const game = new Game(gameData);
      
      // 检查是否可以吃牌
      if (!game.canChi(player.position, gameData.lastDiscardedCard)) {
        return res.status(400).json({
          success: false,
          message: '无法吃牌'
        });
      }

      // 执行吃牌操作
      this.executeChiAction(game, player.position, cardIds);
      
      await gameData.save();

      logger.info(`玩家吃牌: ${userId}, 游戏: ${gameId}`);

      res.json({
        success: true,
        data: {
          gameState: game.getGameState(),
          action: PLAYER_ACTIONS.CHI
        }
      });

    } catch (error) {
      logger.error('玩家吃牌失败:', error);
      res.status(500).json({
        success: false,
        message: error.message || '吃牌失败'
      });
    }
  }

  /**
   * 玩家碰牌
   */
  static async playerPeng(req, res) {
    try {
      const { gameId } = req.params;
      const userId = req.user.id;

      const gameData = await GameModel.findById(gameId);
      if (!gameData) {
        return res.status(404).json({
          success: false,
          message: '游戏不存在'
        });
      }

      const player = gameData.players.find(p => p.userId.toString() === userId.toString());
      if (!player) {
        return res.status(403).json({
          success: false,
          message: '您不在此游戏中'
        });
      }

      const game = new Game(gameData);
      
      // 检查是否可以碰牌
      if (!game.canPeng(player.position, gameData.lastDiscardedCard)) {
        return res.status(400).json({
          success: false,
          message: '无法碰牌'
        });
      }

      // 执行碰牌操作
      this.executePengAction(game, player.position, gameData.lastDiscardedCard);
      
      await gameData.save();

      logger.info(`玩家碰牌: ${userId}, 游戏: ${gameId}`);

      res.json({
        success: true,
        data: {
          gameState: game.getGameState(),
          action: PLAYER_ACTIONS.PENG
        }
      });

    } catch (error) {
      logger.error('玩家碰牌失败:', error);
      res.status(500).json({
        success: false,
        message: error.message || '碰牌失败'
      });
    }
  }

  /**
   * 玩家杠牌
   */
  static async playerGang(req, res) {
    try {
      const { gameId } = req.params;
      const { gangType } = req.body; // 'ming' 明杠, 'an' 暗杠, 'jia' 加杠
      const userId = req.user.id;

      const gameData = await GameModel.findById(gameId);
      if (!gameData) {
        return res.status(404).json({
          success: false,
          message: '游戏不存在'
        });
      }

      const player = gameData.players.find(p => p.userId.toString() === userId.toString());
      if (!player) {
        return res.status(403).json({
          success: false,
          message: '您不在此游戏中'
        });
      }

      const game = new Game(gameData);
      
      // 根据杠牌类型执行不同操作
      if (gangType === 'ming' && !game.canGang(player.position, gameData.lastDiscardedCard)) {
        return res.status(400).json({
          success: false,
          message: '无法明杠'
        });
      }

      // 执行杠牌操作
      this.executeGangAction(game, player.position, gangType, gameData.lastDiscardedCard);
      
      await gameData.save();

      logger.info(`玩家杠牌: ${userId}, 游戏: ${gameId}, 类型: ${gangType}`);

      res.json({
        success: true,
        data: {
          gameState: game.getGameState(),
          action: PLAYER_ACTIONS.GANG,
          gangType: gangType
        }
      });

    } catch (error) {
      logger.error('玩家杠牌失败:', error);
      res.status(500).json({
        success: false,
        message: error.message || '杠牌失败'
      });
    }
  }

  /**
   * 玩家胡牌
   */
  static async playerHu(req, res) {
    try {
      const { gameId } = req.params;
      const userId = req.user.id;

      const gameData = await GameModel.findById(gameId);
      if (!gameData) {
        return res.status(404).json({
          success: false,
          message: '游戏不存在'
        });
      }

      const player = gameData.players.find(p => p.userId.toString() === userId.toString());
      if (!player) {
        return res.status(403).json({
          success: false,
          message: '您不在此游戏中'
        });
      }

      const game = new Game(gameData);
      
      // 检查是否可以胡牌
      if (!game.canHu(player.position, gameData.lastDiscardedCard)) {
        return res.status(400).json({
          success: false,
          message: '无法胡牌'
        });
      }

      // 计算胡牌信息
      const huInfo = this.calculateHuInfo(game, player.position);
      
      // 结束游戏
      game.endGame(player.position, huInfo.winType, huInfo.fanCount, huInfo.huCount);
      
      await gameData.save();

      // 更新房间状态
      const room = await Room.findByRoomId(gameData.roomId);
      if (room) {
        await room.gameFinished({
          gameId: gameData._id,
          startTime: gameData.startTime,
          endTime: gameData.endTime,
          winner: player.position,
          scores: gameData.players.map(p => p.score)
        });
      }

      logger.info(`玩家胡牌: ${userId}, 游戏: ${gameId}`);

      res.json({
        success: true,
        data: {
          gameState: game.getGameState(),
          action: PLAYER_ACTIONS.HU,
          huInfo: huInfo
        }
      });

    } catch (error) {
      logger.error('玩家胡牌失败:', error);
      res.status(500).json({
        success: false,
        message: error.message || '胡牌失败'
      });
    }
  }

  /**
   * 玩家过牌
   */
  static async playerPass(req, res) {
    try {
      const { gameId } = req.params;
      const userId = req.user.id;

      const gameData = await GameModel.findById(gameId);
      if (!gameData) {
        return res.status(404).json({
          success: false,
          message: '游戏不存在'
        });
      }

      const player = gameData.players.find(p => p.userId.toString() === userId.toString());
      if (!player) {
        return res.status(403).json({
          success: false,
          message: '您不在此游戏中'
        });
      }

      const game = new Game(gameData);
      
      // 清除玩家的可用动作
      delete player.availableActions;
      
      await gameData.save();

      res.json({
        success: true,
        data: {
          gameState: game.getGameState(),
          action: PLAYER_ACTIONS.PASS
        }
      });

    } catch (error) {
      logger.error('玩家过牌失败:', error);
      res.status(500).json({
        success: false,
        message: error.message || '过牌失败'
      });
    }
  }

  /**
   * 执行吃牌操作
   */
  static executeChiAction(game, playerPosition, cardIds) {
    const player = game.data.players[playerPosition];
    const discardedCard = game.data.lastDiscardedCard;
    
    // 从手牌中移除相关牌
    cardIds.forEach(cardId => {
      if (cardId !== discardedCard) {
        const index = player.handCards.indexOf(cardId);
        if (index > -1) {
          player.handCards.splice(index, 1);
        }
      }
    });
    
    // 添加到明牌区
    player.exposedCards.push({
      type: 'chi',
      cards: cardIds,
      from: game.data.currentPlayer
    });
    
    // 设置当前玩家
    game.data.currentPlayer = playerPosition;
  }

  /**
   * 执行碰牌操作
   */
  static executePengAction(game, playerPosition, cardId) {
    const player = game.data.players[playerPosition];
    
    // 从手牌中移除两张相同的牌
    let removed = 0;
    for (let i = player.handCards.length - 1; i >= 0 && removed < 2; i--) {
      if (player.handCards[i] === cardId) {
        player.handCards.splice(i, 1);
        removed++;
      }
    }
    
    // 添加到明牌区
    player.exposedCards.push({
      type: 'peng',
      cards: [cardId, cardId, cardId],
      from: game.data.currentPlayer
    });
    
    // 设置当前玩家
    game.data.currentPlayer = playerPosition;
  }

  /**
   * 执行杠牌操作
   */
  static executeGangAction(game, playerPosition, gangType, cardId) {
    const player = game.data.players[playerPosition];
    
    if (gangType === 'ming') {
      // 明杠：从手牌中移除三张相同的牌
      let removed = 0;
      for (let i = player.handCards.length - 1; i >= 0 && removed < 3; i--) {
        if (player.handCards[i] === cardId) {
          player.handCards.splice(i, 1);
          removed++;
        }
      }
      
      player.exposedCards.push({
        type: 'gang',
        cards: [cardId, cardId, cardId, cardId],
        from: game.data.currentPlayer
      });
    }
    
    // 杠牌后需要补牌
    if (game.deck.hasCards()) {
      const newCard = game.deck.drawCard();
      player.handCards.push(newCard.id);
    }
    
    game.data.currentPlayer = playerPosition;
  }

  /**
   * 计算胡牌信息
   */
  static calculateHuInfo(game, playerPosition) {
    const player = game.data.players[playerPosition];
    
    // 计算花牌番数
    const flowerFan = game.calculateFlowerFan(playerPosition);
    
    // TODO: 实现完整的胡牌计算逻辑
    // 这里需要根据宁海麻将规则计算具体的番数和胡数
    
    return {
      winType: '平胡',
      fanCount: flowerFan,
      huCount: 30, // 临时值
      flowerCards: player.flowerCards.length
    };
  }

  /**
   * 根据位置获取风位
   */
  static getFengByPosition(position) {
    const fengs = ['dong', 'nan', 'xi', 'bei'];
    return fengs[position];
  }
}

module.exports = GameController;
