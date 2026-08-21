/**
 * Deception Chess Mastermind AI Worker (Patched)
 */
importScripts('engine.js');

const PST = {
  'P': [
    [ 0,  0,  0,  0,  0,  0,  0,  0], [50, 50, 50, 50, 50, 50, 50, 50],
    [10, 10, 20, 30, 30, 20, 10, 10], [ 5,  5, 10, 25, 25, 10,  5,  5],
    [ 0,  0,  0, 20, 20,  0,  0,  0], [ 5, -5,-10,  0,  0,-10, -5,  5],
    [ 5, 10, 10,-20,-20, 10, 10,  5], [ 0,  0,  0,  0,  0,  0,  0,  0]
  ],
  'N': [
    [-50,-40,-30,-30,-30,-30,-40,-50], [-40,-20,  0,  0,  0,  0,-20,-40],
    [-30,  0, 10, 15, 15, 10,  0,-30], [-30,  5, 15, 20, 20, 15,  5,-30],
    [-30,  0, 15, 20, 20, 15,  0,-30], [-30,  5, 10, 15, 15, 10,  5,-30],
    [-40,-20,  0,  5,  5,  0,-20,-40], [-50,-40,-30,-30,-30,-30,-40,-50]
  ],
  'B': [
    [-20,-10,-10,-10,-10,-10,-10,-20], [-10,  0,  0,  0,  0,  0,  0,-10],
    [-10,  0,  5, 10, 10,  5,  0,-10], [-10,  5,  5, 10, 10,  5,  5,-10],
    [-10,  0, 10, 10, 10, 10,  0,-10], [-10, 10, 10, 10, 10, 10, 10,-10],
    [-10,  5,  0,  0,  0,  0,  5,-10], [-20,-10,-10,-10,-10,-10,-10,-20]
  ],
  'R': [
    [ 0,  0,  0,  0,  0,  0,  0,  0], [ 5, 10, 10, 10, 10, 10, 10,  5],
    [-5,  0,  0,  0,  0,  0,  0, -5], [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5], [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5], [ 0,  0,  0,  5,  5,  0,  0,  0]
  ],
  'Q': [
    [-20,-10,-10, -5, -5,-10,-10,-20], [-10,  0,  0,  0,  0,  0,  0,-10],
    [-10,  0,  5,  5,  5,  5,  0,-10], [ -5,  0,  5,  5,  5,  5,  0, -5],
    [  0,  0,  5,  5,  5,  5,  0, -5], [-10,  5,  5,  5,  5,  5,  0,-10],
    [-10,  0,  5,  0,  0,  0,  0,-10], [-20,-10,-10, -5, -5,-10,-10,-20]
  ],
  'K': [
    [-30,-40,-40,-50,-50,-40,-40,-30], [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30], [-30,-40,-40,-50,-50,-40,-40,-30],
    [-20,-30,-30,-40,-40,-30,-30,-20], [-10,-20,-20,-20,-20,-20,-20,-10],
    [ 20, 20,  0,  0,  0,  0, 20, 20], [ 20, 30, 10,  0,  0, 10, 30, 20]
  ]
};

class DeductionTracker {
  constructor(opponentColor) {
    this.opponentColor = opponentColor;
    this.kingSuspicionMap = {};
    this.confirmedSwapType = null;
  }

  analyzeOpponentMove(boardBefore, sr, sc, er, ec, movedPiece) {
    const dr = Math.abs(er - sr);
    const dc = Math.abs(ec - sc);

    if (movedPiece.disguiseType === 'K') {
      if ((dr === 1 && dc === 2) || (dr === 2 && dc === 1)) {
        this.confirmedSwapType = 'N';
      } else if (dr >= 2 && dc >= 2 && dr === dc) {
        this.confirmedSwapType = (this.confirmedSwapType === 'R') ? 'Q' : 'B';
      } else if ((dr >= 2 && dc === 0) || (dr === 0 && dc >= 2)) {
        this.confirmedSwapType = (this.confirmedSwapType === 'B') ? 'Q' : 'R';
      }
    }

    if (movedPiece.disguiseType !== 'K' && movedPiece.disguiseType !== 'P') {
      const disguiseTakeMoves = MoveEngine.getPatternMoves(movedPiece.disguiseType, boardBefore, sr, sc, true);
      const lucrativeCaptures = disguiseTakeMoves.filter(m => {
        if (!m.isCapture) return false;
        const t = boardBefore.grid[m.r][m.c];
        return t && PIECE_VALS[t.realType] >= 300;
      });

      const captured = boardBefore.grid[er][ec];
      if (lucrativeCaptures.length > 0 && !captured) {
        const key = `${er},${ec}`;
        this.kingSuspicionMap[key] = (this.kingSuspicionMap[key] || 0) + 50;
      }
    }
  }

  trackTransformation(r, c, newDisguise) {
    const key = `${r},${c}`;
    this.kingSuspicionMap[key] = 0;
  }
}

class MastermindAI {
  constructor(aiColor, difficulty) {
    this.aiColor = aiColor;
    this.opponentColor = (aiColor === 'W') ? 'B' : 'W';
    this.difficulty = difficulty;
    this.depth = difficulty === 'HARD' ? 4 : (difficulty === 'NORMAL' ? 3 : 1);
    this.tracker = new DeductionTracker(this.opponentColor);
  }

  getAllMoves(board, r, c) {
    const piece = board.grid[r][c];
    if (!piece) return [];

    const combinedMoves = [];
    const seen = new Set();

    const takeMoves = MoveEngine.getPatternMoves(piece.realType, board, r, c, true);
    for (const m of takeMoves) {
      seen.add(`${m.r},${m.c}`);
      combinedMoves.push({ r: m.r, c: m.c, type: m.isCapture ? 'take-capture' : 'take-empty', isEnPassant: m.isEnPassant });
    }

    if (piece.disguiseType !== piece.realType) {
      const disguiseMoves = MoveEngine.getPatternMoves(piece.disguiseType, board, r, c, false);
      for (const m of disguiseMoves) {
        if (!seen.has(`${m.r},${m.c}`) && board.isEmpty(m.r, m.c)) {
          seen.add(`${m.r},${m.c}`);
          combinedMoves.push({ r: m.r, c: m.c, type: 'disguise-empty', isEnPassant: false });
        }
      }
    }

    return combinedMoves.filter(m => {
      const simBoard = board.clone();
      simBoard.grid[m.r][m.c] = simBoard.grid[r][c];
      simBoard.grid[r][c] = null;
      if (m.isEnPassant) simBoard.grid[r][m.c] = null;
      return !simBoard.isCheck(piece.color);
    });
  }

  getAllLegalActions(board, color) {
    const actions = [];

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board.grid[r][c];
        if (p && p.color === color) {
          const moves = this.getAllMoves(board, r, c);
          for (const m of moves) {
            actions.push({ actionType: 'MOVE', sr: r, sc: c, er: m.r, ec: m.c, moveObj: m, piece: p });
          }

          if (color === this.aiColor && this.difficulty === 'HARD' && p.realType !== 'K' && p.realType !== 'P' && !board.isCheck(color)) {
            const isThreatened = board.isSquareAttacked(r, c, this.opponentColor);
            if (isThreatened || moves.length <= 1) {
              const testDisguises = ['N', 'Q'];
              for (const dis of testDisguises) {
                if (p.disguiseType !== dis) {
                  actions.push({ actionType: 'TRANSFORM', r, c, newDisguise: dis, piece: p });
                }
              }
            }
          }
        }
      }
    }
    return actions;
  }

  applyAction(board, action) {
    if (action.actionType === 'TRANSFORM') {
      const p = board.grid[action.r][action.c];
      if (p) p.disguiseType = action.newDisguise;
      board.enPassantTarget = null;
      return;
    }

    const { sr, sc, er, ec, moveObj } = action;
    const movingPiece = board.grid[sr][sc];
    let capturedPiece = board.grid[er][ec];

    if (moveObj.isEnPassant) {
      capturedPiece = board.grid[sr][ec];
      board.grid[sr][ec] = null;
    }

    if (capturedPiece && capturedPiece.isFakeKing) {
      const realKing = board.findRealKingPiece(capturedPiece.color);
      if (realKing) realKing.disguiseType = 'K';
    }

    if (movingPiece.isFakeKing && capturedPiece) {
      movingPiece.disguiseType = movingPiece.realType;
      const realKing = board.findRealKingPiece(movingPiece.color);
      if (realKing) realKing.disguiseType = 'K';
    }

    board.grid[er][ec] = movingPiece;
    board.grid[sr][sc] = null;

    if (movingPiece.realType === 'P' && Math.abs(er - sr) === 2) {
      board.enPassantTarget = { r: (sr + er) / 2, c: sc, pawnR: er, pawnC: ec };
    } else {
      board.enPassantTarget = null;
    }

    if (movingPiece.realType === 'P' && (er === 0 || er === 7)) {
      movingPiece.realType = 'Q';
      movingPiece.disguiseType = 'Q';
    }
  }

  evaluate(board) {
    let score = 0;

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board.grid[r][c];
        if (!p) continue;

        const base = PIECE_VALS[p.realType] || 0;
        const pst = (p.color === 'W') ? PST[p.realType][r][c] : PST[p.realType][7 - r][c];
        const val = base + pst;

        if (p.color === this.aiColor) {
          score += val;
        } else {
          score -= val;
          const suspicion = this.tracker.kingSuspicionMap[`${r},${c}`] || 0;
          if (suspicion > 30 && board.isSquareAttacked(r, c, this.aiColor)) {
            score += (suspicion * 2.5);
          }
        }
      }
    }

    const aiKing = board.findRealKingPiece(this.aiColor);
    if (aiKing && aiKing.disguiseType !== 'K') score += 200;

    const oppKing = board.findRealKingPiece(this.opponentColor);
    if (oppKing && oppKing.disguiseType === 'K') score += 250;

    return score;
  }

  // [수정] 가짜 킹의 포획 대상에 따른 정밀 가중치 계산
  calculateFakeKingTradeoff(board, act) {
    if (act.actionType !== 'MOVE' || !act.piece.isFakeKing) return 0;
    const target = board.grid[act.er][act.ec];
    if (!target) return 0;

    const capVal = PIECE_VALS[target.realType] || 0;

    if (capVal >= 900) {
      // ♛ 퀸 포획: 정체 들통나도 무조건 대이득 (+500 가산점)
      return +500;
    } else if (capVal >= 500) {
      // ♜ 룩 포획: 충분히 남는 장사 (+200 가산점)
      return +200;
    } else if (capVal >= 300) {
      // ♞/♝ 마이너 피스: 약간의 망설임 (약간 감점)
      return -50;
    } else {
      // ♟ 폰 등 저가치 기물: 정체 까발려지면 절대 손해 (-350 페널티)
      return -350;
    }
  }

  minimax(board, depth, alpha, beta, isMaximizing) {
    if (depth === 0) return this.evaluate(board);

    const currentColor = isMaximizing ? this.aiColor : this.opponentColor;
    const actions = this.getAllLegalActions(board, currentColor);

    if (actions.length === 0) {
      if (board.isCheck(currentColor)) return isMaximizing ? (-99999 + (10 - depth)) : (99999 - (10 - depth));
      return 0;
    }

    if (isMaximizing) {
      let maxEval = -Infinity;
      for (const act of actions) {
        const nextBoard = board.clone();
        this.applyAction(nextBoard, act);

        let penalty = 0;
        if (act.actionType === 'TRANSFORM') penalty = -190;
        penalty += this.calculateFakeKingTradeoff(board, act);

        const ev = this.minimax(nextBoard, depth - 1, alpha, beta, false) + penalty;
        maxEval = Math.max(maxEval, ev);
        alpha = Math.max(alpha, ev);
        if (beta <= alpha) break;
      }
      return maxEval;
    } else {
      let minEval = Infinity;
      for (const act of actions) {
        const nextBoard = board.clone();
        this.applyAction(nextBoard, act);
        const ev = this.minimax(nextBoard, depth - 1, alpha, beta, true);
        minEval = Math.min(minEval, ev);
        beta = Math.min(beta, ev);
        if (beta <= alpha) break;
      }
      return minEval;
    }
  }

  findBestAction(board) {
    const actions = this.getAllLegalActions(board, this.aiColor);
    if (actions.length === 0) return null;

    let bestAction = null;
    let bestScore = -Infinity;

    for (const act of actions) {
      const nextBoard = board.clone();
      this.applyAction(nextBoard, act);

      let penalty = 0;
      if (act.actionType === 'TRANSFORM') penalty = -190;
      penalty += this.calculateFakeKingTradeoff(board, act);

      const score = this.minimax(nextBoard, this.depth - 1, -Infinity, Infinity, false) + penalty;
      if (score > bestScore) {
        bestScore = score;
        bestAction = act;
      }
    }
    return bestAction;
  }

  getOptimalSwap() {
    const targetRow = (this.aiColor === 'W') ? 7 : 0;
    const candidates = [
      { col: 1, weight: 45 }, { col: 6, weight: 45 },
      { col: 0, weight: 25 }, { col: 7, weight: 25 },
      { col: 3, weight: 15 },
      { col: 2, weight: 15 }, { col: 5, weight: 15 }
    ];
    const total = candidates.reduce((s, c) => s + c.weight, 0);
    let rand = Math.random() * total;
    for (const c of candidates) {
      if (rand < c.weight) return { r: targetRow, c: c.col };
      rand -= c.weight;
    }
    return { r: targetRow, c: 1 };
  }
}

let mastermindEngine = null;

self.onmessage = function(e) {
  const { action, boardData, aiColor, difficulty, lastOpponentMove, transformEvent } = e.data;
  const board = Board.deserialize(boardData);

  if (!mastermindEngine || mastermindEngine.aiColor !== aiColor) {
    mastermindEngine = new MastermindAI(aiColor, difficulty);
  }

  if (lastOpponentMove) {
    const { sr, sc, er, ec, movedPiece, boardBefore } = lastOpponentMove;
    const bBefore = Board.deserialize(boardBefore);
    mastermindEngine.tracker.analyzeOpponentMove(bBefore, sr, sc, er, ec, movedPiece);
  }

  if (transformEvent) {
    mastermindEngine.tracker.trackTransformation(transformEvent.r, transformEvent.c, transformEvent.newDisguise);
  }

  if (action === 'SWAP') {
    const swapPos = mastermindEngine.getOptimalSwap();
    self.postMessage({ action: 'SWAP_RESULT', swapPos });
  } else if (action === 'ACTION') {
    const bestAction = mastermindEngine.findBestAction(board);
    self.postMessage({ action: 'ACTION_RESULT', bestAction });
  }
};
