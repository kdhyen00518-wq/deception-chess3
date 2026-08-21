/**
 * Deception Chess Mastermind AI Worker
 * Features:
 *  - Deduction Tracker (Hyper-move & Missed-capture profiling)
 *  - Tactical Rule-3 Transformation Generator (Escape / Infiltration)
 *  - Depth-4 Alpha-Beta Pruning with Quiescence Search
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

// 상대방 블러핑 추리 프로파일러
class DeductionTracker {
  constructor(opponentColor) {
    this.opponentColor = opponentColor;
    this.kingSuspicionMap = {}; // "r,c" -> 의심 점수
    this.confirmedSwapType = null;
  }

  analyzeOpponentMove(boardBefore, sr, sc, er, ec, movedPiece) {
    const dr = Math.abs(er - sr);
    const dc = Math.abs(ec - sc);

    // 1. 가짜 킹의 초과 행마 감지
    if (movedPiece.disguiseType === 'K') {
      if ((dr === 1 && dc === 2) || (dr === 2 && dc === 1)) {
        this.confirmedSwapType = 'N';
      } else if (dr >= 2 && dc >= 2 && dr === dc) {
        this.confirmedSwapType = (this.confirmedSwapType === 'R') ? 'Q' : 'B';
      } else if ((dr >= 2 && dc === 0) || (dr === 0 && dc >= 2)) {
        this.confirmedSwapType = (this.confirmedSwapType === 'B') ? 'Q' : 'R';
      }
    }

    // 2. 진짜 킹의 포획 불발 감지 (공짜 기물을 두고 빈칸으로 피신)
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
        this.kingSuspicionMap[key] = (this.kingSuspicionMap[key] || 0) + 45;
      }
    }
  }

  // 3번 룰 변신 시 상대 기물 상태 갱신
  trackTransformation(r, c, newDisguise) {
    const key = `${r},${c}`;
    // 3번 룰로 변신한 기물은 킹이나 폰이 아님을 확인 (의심 배제)
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

  // 이동 수 + 전술적 3번 룰 변신 후보군 수집
  getAllLegalActions(board, color) {
    const actions = [];

    // 1. 일반 이동 액션 수집
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board.grid[r][c];
        if (p && p.color === color) {
          const moves = this.getAllMoves(board, r, c);
          for (const m of moves) {
            actions.push({ actionType: 'MOVE', sr: r, sc: c, er: m.r, ec: m.c, moveObj: m, piece: p });
          }

          // 2. 3번 룰(외형 변신)의 전략적 후보군 필터링 (AI 전용 고도화)
          // 킹과 폰은 변신 불가, 체크 상태 아닐 때만 고려
          if (color === this.aiColor && this.difficulty === 'HARD' && p.realType !== 'K' && p.realType !== 'P' && !board.isCheck(color)) {
            const isThreatened = board.isSquareAttacked(r, c, this.opponentColor);
            const currentMoveCount = moves.length;

            // 조건 A (긴급 탈출): 적에게 위협받고 있으나 현재 탈출로가 부족할 때 -> 나이트/퀸 변신 고려
            // 조건 B (엔드게임 돌파): 기물이 폰 장벽에 막혀 이동 수가 0~1개일 때 -> 나이트 변신 고려
            if (isThreatened || currentMoveCount <= 1) {
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
          // 추리된 의심 킹에 대한 공격 가산점
          const suspicion = this.tracker.kingSuspicionMap[`${r},${c}`] || 0;
          if (suspicion > 30 && board.isSquareAttacked(r, c, this.aiColor)) {
            score += (suspicion * 2.2);
          }
        }
      }
    }

    // 내 진짜 킹의 은신 유지 보너스
    const aiKing = board.findRealKingPiece(this.aiColor);
    if (aiKing && aiKing.disguiseType !== 'K') score += 280;

    // 상대 결속 파괴 가산점
    const oppKing = board.findRealKingPiece(this.opponentColor);
    if (oppKing && oppKing.disguiseType === 'K') score += 320;

    return score;
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
        // 3번 룰 변신 시 1턴 소모(Tempo loss)에 대한 페널티
        if (act.actionType === 'TRANSFORM') penalty = -190;

        // 가짜 킹이 사소한 폰을 잡아 정체를 드러내는 악수 방지
        if (act.actionType === 'MOVE' && act.piece.isFakeKing && board.grid[act.er][act.ec]) {
          const capVal = PIECE_VALS[board.grid[act.er][act.ec].realType] || 0;
          if (capVal < 350) penalty = -320;
        }

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
      if (act.actionType === 'MOVE' && act.piece.isFakeKing && board.grid[act.er][act.ec]) {
        const capVal = PIECE_VALS[board.grid[act.er][act.ec].realType] || 0;
        if (capVal < 350) penalty = -320;
      }

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
      { col: 1, weight: 45 }, { col: 6, weight: 45 }, // 나이트
      { col: 0, weight: 25 }, { col: 7, weight: 25 }, // 룩
      { col: 3, weight: 15 },                         // 퀸
      { col: 2, weight: 15 }, { col: 5, weight: 15 }  // 비숍
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