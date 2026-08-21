/**
 * Deception Chess Game Engine Core (engine.js)
 */
const SYMBOLS = { 'K': '♚', 'Q': '♛', 'R': '♜', 'B': '♝', 'N': '♞', 'P': '♟' };
const NAMES = { 'K': '킹', 'Q': '퀸', 'R': '룩', 'B': '비숍', 'N': '나이트', 'P': '폰' };
const PIECE_VALS = { 'P': 100, 'N': 320, 'B': 330, 'R': 500, 'Q': 900, 'K': 20000 };

class Piece {
  constructor(color, realType, disguiseType = null) {
    this.color = color;
    this.realType = realType;
    this.disguiseType = disguiseType || realType;
    this.isFakeKing = false;
  }
  get symbol() { return SYMBOLS[this.disguiseType]; }
  clone() {
    const p = new Piece(this.color, this.realType, this.disguiseType);
    p.isFakeKing = this.isFakeKing;
    return p;
  }
}

class MoveEngine {
  static getRayMoves(board, r, c, directions, allowCapture) {
    const moves = [];
    const piece = board.grid[r][c];
    for (const [dr, dc] of directions) {
      let nr = r + dr, nc = c + dc;
      while (board.inBounds(nr, nc)) {
        if (board.isEmpty(nr, nc)) {
          moves.push({ r: nr, c: nc, isCapture: false, isEnPassant: false });
        } else {
          if (allowCapture && board.isEnemy(nr, nc, piece.color)) {
            moves.push({ r: nr, c: nc, isCapture: true, isEnPassant: false });
          }
          break;
        }
        nr += dr; nc += dc;
      }
    }
    return moves;
  }

  static getOffsetMoves(board, r, c, offsets, allowCapture) {
    const moves = [];
    const piece = board.grid[r][c];
    for (const [dr, dc] of offsets) {
      const nr = r + dr, nc = c + dc;
      if (board.inBounds(nr, nc)) {
        if (board.isEmpty(nr, nc)) {
          moves.push({ r: nr, c: nc, isCapture: false, isEnPassant: false });
        } else if (allowCapture && board.isEnemy(nr, nc, piece.color)) {
          moves.push({ r: nr, c: nc, isCapture: true, isEnPassant: false });
        }
      }
    }
    return moves;
  }

  static getPawnMoves(board, r, c, allowCapture) {
    const moves = [];
    const piece = board.grid[r][c];
    const dir = piece.color === 'W' ? -1 : 1;
    const startRow = piece.color === 'W' ? 6 : 1;

    const fwdR = r + dir;
    if (board.isEmpty(fwdR, c)) {
      moves.push({ r: fwdR, c: c, isCapture: false, isEnPassant: false });
      const fwd2R = r + (dir * 2);
      if (r === startRow && board.isEmpty(fwd2R, c)) {
        moves.push({ r: fwd2R, c: c, isCapture: false, isEnPassant: false });
      }
    }

    if (allowCapture) {
      for (const dc of [-1, 1]) {
        const capC = c + dc;
        if (board.inBounds(fwdR, capC)) {
          if (board.isEnemy(fwdR, capC, piece.color)) {
            moves.push({ r: fwdR, c: capC, isCapture: true, isEnPassant: false });
          } else if (board.enPassantTarget && board.enPassantTarget.r === fwdR && board.enPassantTarget.c === capC) {
            moves.push({ r: fwdR, c: capC, isCapture: true, isEnPassant: true });
          }
        }
      }
    }
    return moves;
  }

  static getPatternMoves(type, board, r, c, allowCapture) {
    switch (type) {
      case 'P': return this.getPawnMoves(board, r, c, allowCapture);
      case 'N': return this.getOffsetMoves(board, r, c, [
        [-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]
      ], allowCapture);
      case 'B': return this.getRayMoves(board, r, c, [[-1, -1], [-1, 1], [1, -1], [1, 1]], allowCapture);
      case 'R': return this.getRayMoves(board, r, c, [[-1, 0], [1, 0], [0, -1], [0, 1]], allowCapture);
      case 'Q': return this.getRayMoves(board, r, c, [
        [-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]
      ], allowCapture);
      case 'K': return this.getOffsetMoves(board, r, c, [
        [-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]
      ], allowCapture);
      default: return [];
    }
  }
}

class Board {
  constructor() {
    this.rows = 8;
    this.cols = 8;
    this.grid = Array.from({ length: 8 }, () => Array(8).fill(null));
    this.enPassantTarget = null;
    this.setupInitial();
  }

  clone() {
    const newBoard = new Board();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        newBoard.grid[r][c] = this.grid[r][c] ? this.grid[r][c].clone() : null;
      }
    }
    newBoard.enPassantTarget = this.enPassantTarget ? { ...this.enPassantTarget } : null;
    return newBoard;
  }

  inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }
  isEmpty(r, c) { return this.inBounds(r, c) && this.grid[r][c] === null; }
  isEnemy(r, c, myColor) {
    if (!this.inBounds(r, c)) return false;
    const p = this.grid[r][c];
    return p !== null && p.color !== myColor;
  }

  setupInitial() {
    const back = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
    for (let c = 0; c < 8; c++) {
      this.grid[0][c] = new Piece('B', back[c]);
      this.grid[1][c] = new Piece('B', 'P');
      this.grid[6][c] = new Piece('W', 'P');
      this.grid[7][c] = new Piece('W', back[c]);
    }
  }

  findRealKing(color) {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = this.grid[r][c];
        if (p && p.color === color && p.realType === 'K') return [r, c];
      }
    }
    return null;
  }

  findRealKingPiece(color) {
    const pos = this.findRealKing(color);
    return pos ? this.grid[pos[0]][pos[1]] : null;
  }

  findFakeKingPiece(color) {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = this.grid[r][c];
        if (p && p.color === color && p.isFakeKing) return { piece: p, r, c };
      }
    }
    return null;
  }

  isSquareAttacked(targetR, targetC, attackerColor) {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = this.grid[r][c];
        if (p && p.color === attackerColor) {
          const attackMoves = MoveEngine.getPatternMoves(p.realType, this, r, c, true);
          if (attackMoves.some(m => m.r === targetR && m.c === targetC && m.isCapture)) return true;
        }
      }
    }
    return false;
  }

  isCheck(kingColor) {
    const kingPos = this.findRealKing(kingColor);
    if (!kingPos) return false;
    const enemyColor = kingColor === 'W' ? 'B' : 'W';
    return this.isSquareAttacked(kingPos[0], kingPos[1], enemyColor);
  }

  // 4 & 5. AI 정보 마스킹 직렬화 (진짜 킹/가짜 킹만 은폐, 룰 3 변신 기물의 본래 공격력은 보존)
  serializeForAI(aiColor) {
    return {
      grid: this.grid.map(row => row.map(cell => {
        if (!cell) return null;
        if (cell.color === aiColor) {
          return {
            color: cell.color,
            realType: cell.realType,
            disguiseType: cell.disguiseType,
            isFakeKing: cell.isFakeKing
          };
        }

        let reportedRealType = cell.realType;

        // 미공개 진짜 킹 / 가짜 킹만 블러핑 처리
        if (cell.realType === 'K' && cell.disguiseType !== 'K') {
          reportedRealType = cell.disguiseType;
        } else if (cell.isFakeKing && cell.disguiseType === 'K') {
          reportedRealType = 'K';
        }

        return {
          color: cell.color,
          realType: reportedRealType,
          disguiseType: cell.disguiseType,
          isFakeKing: false
        };
      })),
      enPassantTarget: this.enPassantTarget
    };
  }

  static deserialize(data) {
    const b = new Board();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const d = data.grid[r][c];
        if (d) {
          const p = new Piece(d.color, d.realType, d.disguiseType);
          p.isFakeKing = d.isFakeKing;
          b.grid[r][c] = p;
        } else {
          b.grid[r][c] = null;
        }
      }
    }
    b.enPassantTarget = data.enPassantTarget;
    return b;
  }
}
