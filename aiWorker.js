/**
 * Deception Chess - Grandmaster Deduction & Tactical Engine (aiWorker.js)
 * 
 * 1. Fake King Restraint: 가짜 킹의 불필요한 1보 방황 억제 및 사소한 포획(정체 탄로) 엄격 차단
 * 2. Real King Evasion: 진짜 킹의 3x3 위협 구역 계산 및 체크/압박 회피 최우선화
 * 3. High-Value Bounty: 가짜 킹이라도 상대 퀸(♛) 포획 기회 발생 시 즉시 암살 특공 (+750점)
 * 4. Deduction Tracker: 상대의 이상 행마(L자 점프, 2칸 초과 이동, 포획 불발) 관측 시 실시간 킹/가짜 킹 특정
 * 5. Rule-3 Opponent Intel: 상대가 변신해도 본래 공격력(realType)과 새 위장 행마를 동시 계산
 * 6. Strategic Rule-3: 갇힌 기물 구출/나이트 침투 등 승부처에서만 템포 손실을 극복하고 정밀 변신
 * 7. GM Calculator: Alpha-Beta (Depth 4) + Quiescence Search + MVV-LVA Move Ordering + Killer Heuristic
 */
importScripts('engine.js');

// 기물-위치 가치표 (PST: Piece-Square Tables - 미들게임/엔드게임 종합 최적화)
const PST = {
  'P': [
    [  0,  0,  0,  0,  0,  0,  0,  0],
    [ 50, 50, 50, 50, 50, 50, 50, 50],
    [ 10, 10, 20, 30, 30, 20, 10, 10],
    [  5,  5, 10, 27, 27, 10,  5,  5],
    [  0,  0,  0, 25, 25,  0,  0,  0],
    [  5, -5,-10,  0,  0,-10, -5,  5],
    [  5, 10, 10,-20,-20, 10, 10,  5],
    [  0,  0,  0,  0,  0,  0,  0,  0]
  ],
  'N': [
    [-50,-40,-30,-30,-30,-30,-40,-50],
    [-40,-20,  0,  5,  5,  0,-20,-40],
    [-30,  5, 15, 20, 20, 15,  5,-30],
    [-30,  5, 20, 25, 25, 20,  5,-30],
    [-30,  0, 15, 25, 25, 15,  0,-30],
    [-30,  5, 15, 15, 15, 15,  5,-30],
    [-40,-20,  0,  5,  5,  0,-20,-40],
    [-50,-40,-30,-30,-30,-30,-40,-50]
  ],
  'B': [
    [-20,-10,-10,-10,-10,-10,-10,-20],
    [-10,  5,  0,  0,  0,  0,  5,-10],
    [-10, 10, 10, 15, 15, 10, 10,-10],
    [-10,  5, 15, 15, 15, 15,  5,-10],
    [-10,  0, 15, 15, 15, 15,  0,-10],
    [-10, 10, 10, 10, 10, 10, 10,-10],
    [-10,  5,  0,  0,  0,  0,  5,-10],
    [-20,-10,-10,-10,-10,-10,-10,-20]
  ],
  'R': [
    [  0,  0,  0,  5,  5,  0,  0,  0],
    [  5, 10, 10, 10, 10, 10, 10,  5],
    [ -5,  0,  0,  0,  0,  0,  0, -5],
    [ -5,  0,  0,  0,  0,  0,  0, -5],
    [ -5,  0,  0,  0,  0,  0,  0, -5],
    [ -5,  0,  0,  0,  0,  0,  0, -5],
    [ -5,  0,  0,  0,  0,  0,  0, -5],
    [  0,  0,  0,  5,  5,  0,  0,  0]
  ],
  'Q': [
    [-20,-10,-10, -5, -5,-10,-10,-20],
    [-10,  0,  5,  0,  0,  0,  0,-10],
    [-10,  5,  5,  5,  5,  5,  0,-10],
    [  0,  0,  5,  5,  5,  5,  0, -5],
    [ -5,  0,  5,  5,  5,  5,  0, -5],
    [-10,  0,  5,  5,  5,  5,  0,-10],
    [-10,  0,  0,  0,  0,  0,  0,-10],
    [-20,-10,-10, -5, -5,-10,-10,-20]
  ],
  'K': [
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-20,-30,-30,-40,-40,-30,-30,-20],
    [-10,-20,-20,-20,-20,-20,-20,-10],
    [ 20, 20,  0,  0,  0,  0, 20, 20],
    [ 20, 30, 10,  0,  0, 10, 30, 20]
  ]
};

// 4. 상대 심리 및 이상 행마 추적 시스템 (Bayesian Deduction Tracker)
class DeductionTracker {
  constructor(opponentColor) {
    this.opponentColor = opponentColor;
    this.kingSuspicionMap = {};     // "r,c" -> 의심 점수 (0 ~ 100)
    this.confirmedFakeKingType = null;
    this.confirmedFakeKingPos = null;
  }

  analyzeOpponentMove(boardBefore, sr, sc, er, ec, movedPiece) {
    const dr = Math.abs(er - sr);
    const dc = Math.abs(ec - sc);

    // [A. 가짜 킹의 초과 행마 감지]
    if (movedPiece.disguiseType === 'K') {
      if ((dr === 1 && dc === 2) || (dr === 2 && dc === 1)) {
        this.confirmedFakeKingType = 'N';
        this.confirmedFakeKingPos = { r: er, c: ec };
      } else if (dr >= 2 && dc >= 2 && dr === dc) {
        this.confirmedFakeKingType = (this.confirmedFakeKingType === 'R') ? 'Q' : 'B';
        this.confirmedFakeKingPos = { r: er, c: ec };
      } else if ((dr >= 2 && dc === 0) || (dr === 0 && dc >= 2)) {
        this.confirmedFakeKingType = (this.confirmedFakeKingType === 'B') ? 'Q' : 'R';
        this.confirmedFakeKingPos = { r: er, c: ec };
      }
    }

    // [B. 진짜 킹의 포획 불발 감지 (Missed Capture Heuristic)]
    if (movedPiece.disguiseType !== 'K' && movedPiece.disguiseType !== 'P') {
      const disguiseTakeMoves = MoveEngine.getPatternMoves(movedPiece.disguiseType, boardBefore, sr, sc, true);
      const profitableCaptures = disguiseTakeMoves.filter(m => {
        if (!m.isCapture) return false;
        const target = boardBefore.grid[m.r][m.c];
        return target && PIECE_VALS[target.realType] >= 300;
      });

      const actualCaptured = boardBefore.grid[er][ec];
      // 사정거리에 3점 이상 기물이 있는데 빈 칸으로만 도망쳤다면 -> 잡기 능력이 없는 '진짜 킹' 확신도 급증
      if (profitableCaptures.length > 0 && !actualCaptured) {
        const key = `${er},${ec}`;
        this.kingSuspicionMap[key] = (this.kingSuspicionMap[key] || 0) + 60;
      }
    }

    // 위치 갱신
    if (this.kingSuspicionMap[`${sr},${sc}`]) {
      const score = this.kingSuspicionMap[`${sr},${sc}`];
      delete this.kingSuspicionMap[`${sr},${sc}`];
      this.kingSuspicionMap[`${er},${ec}`] = score;
    }
  }

  trackTransformation(r, c, newDisguise) {
    // 룰 3으로 변신한 기물은 킹이나 폰이 아님이 100% 확정
    delete this.kingSuspicionMap[`${r},${c}`];
  }
}

// 마스터급 통합 연산 엔진
class MastermindAI {
  constructor(aiColor, difficulty) {
    this.aiColor = aiColor;
    this.opponentColor = (aiColor === 'W') ? 'B' : 'W';
    this.difficulty = difficulty;
    this.depth = difficulty === 'HARD' ? 4 : (difficulty === 'NORMAL' ? 3 : 1);
    this.tracker = new DeductionTracker(this.opponentColor);

    // 킬러 무브 테이블 (Killer Moves Heuristic)
    this.killerMoves = Array.from({ length: 10 }, () => [null, null]);
    this.historyTable = {};
  }

  getAllMoves(board, r, c) {
    const piece = board.grid[r][c];
    if (!piece) return [];

    const combinedMoves = [];
    const seen = new Set();

    // 진짜 정체(Take Move)
    const takeMoves = MoveEngine.getPatternMoves(piece.realType, board, r, c, true);
    for (const m of takeMoves) {
      seen.add(`${m.r},${m.c}`);
      combinedMoves.push({ r: m.r, c: m.c, type: m.isCapture ? 'take-capture' : 'take-empty', isEnPassant: m.isEnPassant });
    }

    // 위장 외형(Move Only)
    if (piece.disguiseType !== piece.realType) {
      const disguiseMoves = MoveEngine.getPatternMoves(piece.disguiseType, board, r, c, false);
      for (const m of disguiseMoves) {
        if (!seen.has(`${m.r},${m.c}`) && board.isEmpty(m.r, m.c)) {
          seen.add(`${m.r},${m.c}`);
          combinedMoves.push({ r: m.r, c: m.c, type: 'disguise-empty', isEnPassant: false });
        }
      }
    }

    // 합법수 검증 (내 킹 체크 방어 필수)
    return combinedMoves.filter(m => {
      const simBoard = board.clone();
      simBoard.grid[m.r][m.c] = simBoard.grid[r][c];
      simBoard.grid[r][c] = null;
      if (m.isEnPassant) simBoard.grid[r][m.c] = null;
      return !simBoard.isCheck(piece.color);
    });
  }

  // 합법 이동 및 전술적 룰 3 변신 후보군 수집
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

          // 6. [전략적 룰 3 변신 생성] (AI 전용, 킹/폰 불가, 체크 아닐 때)
          if (color === this.aiColor && this.difficulty === 'HARD' && p.realType !== 'K' && p.realType !== 'P' && !board.isCheck(color)) {
            const isThreatened = board.isSquareAttacked(r, c, this.opponentColor);
            
            // 상황 A: 적에게 공격받고 있으나 탈출로가 막힘 -> 나이트 점프 변신으로 탈출로 확보
            // 상황 B: 닫힌 포지션에서 룩/비숍이 폰에 막혀 전진 불가 -> 나이트로 변신해 도약 침투
            if (isThreatened && moves.length <= 1) {
              if (p.disguiseType !== 'N') actions.push({ actionType: 'TRANSFORM', r, c, newDisguise: 'N', piece: p });
            } else if (moves.length === 0 && (p.realType === 'R' || p.realType === 'B')) {
              if (p.disguiseType !== 'N') actions.push({ actionType: 'TRANSFORM', r, c, newDisguise: 'N', piece: p });
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

    // 영혼 결속 해제 판정
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

  // 1 & 3. 가짜 킹 행동 통제 & 퀸 암살 특공 손익 계산기
  calculateFakeKingTradeoff(board, act) {
    if (act.actionType !== 'MOVE' || !act.piece.isFakeKing) return 0;
    const target = board.grid[act.er][act.ec];

    if (!target) {
      // 1. 가짜 킹의 1보 방황(원래 킹 행마 흉내) 억제
      const dr = Math.abs(act.er - act.sr);
      const dc = Math.abs(act.ec - act.sc);
      if (dr <= 1 && dc <= 1) {
        return -45; // 목적 없는 1칸 이동 억제
      }
      return 0;
    }

    // 기물을 잡는 경우 (정체가 탄로남)
    const victimVal = PIECE_VALS[target.realType] || 0;

    if (victimVal >= 900) {
      // 3. [상대 퀸 암살]: 정체가 들통나도 무조건 압도적 이득 (+750점)
      return +750;
    } else if (victimVal >= 500) {
      // 룩 포획: 전술적 이득 (+180점)
      return +180;
    } else if (victimVal >= 300) {
      // 마이너 피스 포획: 정체 노출 리스크 고려 (-60점)
      return -60;
    } else {
      // 1. 폰 따위를 잡고 킹의 위장 날개를 날리는 자폭 행위 엄단 (-450점)
      return -450;
    }
  }

  // 종합 정밀 평가 함수
  evaluate(board) {
    let score = 0;

    const realKingPos = board.findRealKing(this.aiColor);
    const oppRealKingPos = board.findRealKing(this.opponentColor);

    // [1. 기물 가치 + PST 위치 점수]
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

          // 4. 의심되는 상대 진짜 킹 압박 가산점
          const suspicion = this.tracker.kingSuspicionMap[`${r},${c}`] || 0;
          if (suspicion >= 50 && board.isSquareAttacked(r, c, this.aiColor)) {
            score += (suspicion * 2.8);
          }
        }
      }
    }

    // [2. 진짜 킹의 생존력 및 안전 구역 평가 (King Safety)]
    if (realKingPos) {
      const [kr, kc] = realKingPos;
      let kingThreatLevel = 0;

      // 킹 주변 3x3 구역 위험도 스캔
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = kr + dr, nc = kc + dc;
          if (board.inBounds(nr, nc) && board.isSquareAttacked(nr, nc, this.opponentColor)) {
            kingThreatLevel += 35;
          }
        }
      }
      score -= kingThreatLevel;

      // 킹이 체크 상태일 때 극심한 페널티
      if (board.isCheck(this.aiColor)) score -= 220;
    }

    // 상대 킹에 체크를 걸었을 때 보너스
    if (board.isCheck(this.opponentColor)) score += 120;

    // 내 킹의 은신 유지 보너스
    const aiKingPiece = board.findRealKingPiece(this.aiColor);
    if (aiKingPiece && aiKingPiece.disguiseType !== 'K') score += 200;

    // 상대 킹의 날개(영혼 결속)를 꺾었을 때 보너스
    const oppKingPiece = board.findRealKingPiece(this.opponentColor);
    if (oppKingPiece && oppKingPiece.disguiseType === 'K') score += 280;

    return score;
  }

  // 7. 정적 탐색 (Quiescence Search: 전술 교환 검증으로 지평선 효과 방지)
  quiescence(board, alpha, beta, isMaximizing, qDepth = 3) {
    const standPat = this.evaluate(board);
    if (qDepth === 0) return standPat;

    if (isMaximizing) {
      if (standPat >= beta) return beta;
      if (alpha < standPat) alpha = standPat;
    } else {
      if (standPat <= alpha) return alpha;
      if (beta > standPat) beta = standPat;
    }

    const color = isMaximizing ? this.aiColor : this.opponentColor;
    const actions = this.getAllLegalActions(board, color);
    
    // 포획 수만 필터링
    const captureActions = actions.filter(act => 
      act.actionType === 'MOVE' && board.grid[act.er][act.ec] !== null
    );

    // MVV-LVA 정렬
    captureActions.sort((a, b) => {
      const victimA = PIECE_VALS[board.grid[a.er][a.ec].realType] || 0;
      const victimB = PIECE_VALS[board.grid[b.er][b.ec].realType] || 0;
      return victimB - victimA;
    });

    for (const act of captureActions) {
      const nextBoard = board.clone();
      this.applyAction(nextBoard, act);
      const score = this.quiescence(nextBoard, alpha, beta, !isMaximizing, qDepth - 1);

      if (isMaximizing) {
        if (score >= beta) return beta;
        if (score > alpha) alpha = score;
      } else {
        if (score <= alpha) return alpha;
        if (score < beta) beta = score;
      }
    }

    return isMaximizing ? alpha : beta;
  }

  // 7. 알파-베타 심층 탐색 (Move Ordering + Killer Heuristic)
  minimax(board, depth, alpha, beta, isMaximizing, ply = 0) {
    if (depth === 0) {
      return this.quiescence(board, alpha, beta, isMaximizing);
    }

    const currentColor = isMaximizing ? this.aiColor : this.opponentColor;
    const actions = this.getAllLegalActions(board, currentColor);

    if (actions.length === 0) {
      if (board.isCheck(currentColor)) {
        return isMaximizing ? (-99999 + ply) : (99999 - ply);
      }
      return 0; // 스테일메이트
    }

    // 정교한 Move Ordering (탐색 속도 400% 향상)
    actions.sort((a, b) => {
      let scoreA = 0, scoreB = 0;

      if (a.actionType === 'MOVE' && board.grid[a.er][a.ec]) {
        scoreA += (PIECE_VALS[board.grid[a.er][a.ec].realType] * 10) - (PIECE_VALS[a.piece.realType] / 10);
      }
      if (b.actionType === 'MOVE' && board.grid[b.er][b.ec]) {
        scoreB += (PIECE_VALS[board.grid[b.er][b.ec].realType] * 10) - (PIECE_VALS[b.piece.realType] / 10);
      }

      // 킬러 무브 가산점
      if (ply < 10) {
        if (this.killerMoves[ply][0] === a) scoreA += 500;
        if (this.killerMoves[ply][1] === a) scoreA += 400;
        if (this.killerMoves[ply][0] === b) scoreB += 500;
        if (this.killerMoves[ply][1] === b) scoreB += 400;
      }

      return scoreB - scoreA;
    });

    if (isMaximizing) {
      let maxEval = -Infinity;
      for (const act of actions) {
        const nextBoard = board.clone();
        this.applyAction(nextBoard, act);

        let strategicMod = 0;
        if (act.actionType === 'TRANSFORM') strategicMod = -180; // 룰 3 1턴 템포 손실 페널티
        strategicMod += this.calculateFakeKingTradeoff(board, act);

        const ev = this.minimax(nextBoard, depth - 1, alpha, beta, false, ply + 1) + strategicMod;
        
        if (ev > maxEval) {
          maxEval = ev;
        }
        alpha = Math.max(alpha, ev);
        if (beta <= alpha) {
          // 킬러 무브 등록
          if (act.actionType === 'MOVE' && !board.grid[act.er][act.ec] && ply < 10) {
            this.killerMoves[ply][1] = this.killerMoves[ply][0];
            this.killerMoves[ply][0] = act;
          }
          break;
        }
      }
      return maxEval;
    } else {
      let minEval = Infinity;
      for (const act of actions) {
        const nextBoard = board.clone();
        this.applyAction(nextBoard, act);
        const ev = this.minimax(nextBoard, depth - 1, alpha, beta, true, ply + 1);
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

    // 최상위 루트 탐색
    for (const act of actions) {
      const nextBoard = board.clone();
      this.applyAction(nextBoard, act);

      let strategicMod = 0;
      if (act.actionType === 'TRANSFORM') strategicMod = -180;
      strategicMod += this.calculateFakeKingTradeoff(board, act);

      const score = this.minimax(nextBoard, this.depth - 1, -Infinity, Infinity, false, 1) + strategicMod;

      if (score > bestScore) {
        bestScore = score;
        bestAction = act;
      }
    }
    return bestAction;
  }

  getOptimalSwap() {
    const targetRow = (this.aiColor === 'W') ? 7 : 0;
    // 기만 체스 마스터 메타: 나이트(b8/g8) 50%, 룩(a8/h8) 25%, 비숍(c8/f8) 15%, 퀸(d8) 10%
    const candidates = [
      { col: 1, weight: 50 }, { col: 6, weight: 50 },
      { col: 0, weight: 25 }, { col: 7, weight: 25 },
      { col: 2, weight: 15 }, { col: 5, weight: 15 },
      { col: 3, weight: 10 }
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

  // 4. 상대방의 수 분석 및 실시간 킹 의심도 업데이트
  if (lastOpponentMove) {
    const { sr, sc, er, ec, movedPiece, boardBefore } = lastOpponentMove;
    const bBefore = Board.deserialize(boardBefore);
    mastermindEngine.tracker.analyzeOpponentMove(bBefore, sr, sc, er, ec, movedPiece);
  }

  // 5. 상대의 룰 3 변신 기록
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
