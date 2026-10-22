import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

const Pagination: React.FC<PaginationProps> = ({ page, total, pageSize, onPageChange }) => {
  const totalPages = Math.ceil(total / pageSize);
  const [jumpValue, setJumpValue] = useState('');

  if (totalPages <= 1) return null;

  const handleJump = () => {
    const num = parseInt(jumpValue, 10);
    if (!isNaN(num) && num >= 1 && num <= totalPages) {
      onPageChange(num - 1);
      setJumpValue('');
    }
  };

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-slate-200">
      <span className="text-xs text-slate-500">共 {total} 条</span>
      <div className="flex items-center gap-3">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 0}
          className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-4 h-4 text-slate-600" />
        </button>
        <span className="text-xs text-slate-600 min-w-[60px] text-center">
          {page + 1} / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages - 1}
          className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="w-4 h-4 text-slate-600" />
        </button>
        <div className="flex items-center gap-1.5 ml-2">
          <input
            type="number"
            min={1}
            max={totalPages}
            value={jumpValue}
            onChange={(e) => setJumpValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleJump()}
            placeholder="页码"
            className="w-14 px-2 py-1 text-xs text-center border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300"
          />
          <button
            onClick={handleJump}
            className="px-2 py-1 text-xs text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
          >
            跳转
          </button>
        </div>
      </div>
    </div>
  );
};

export default Pagination;
