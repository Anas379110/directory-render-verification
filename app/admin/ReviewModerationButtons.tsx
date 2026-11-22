'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** قرار إشراف على تقييم — نفس نمط ApproveRejectButtons لكن على مسار التقييمات */
export default function ReviewModerationButtons({ id }: { id: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleDecision = async (
    decision: 'approved' | 'rejected',
    rejectionReason?: string,
  ) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/reviews/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ decision, rejectionReason }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert('Error: ' + (err.error || err));
      } else {
        router.refresh();
      }
    } catch (err: unknown) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Request failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = () => {
    handleDecision('approved');
  };

  const handleReject = async () => {
    const rejectionReason = window.prompt('سبب الرفض');
    if (!rejectionReason) {
      return;
    }
    await handleDecision('rejected', rejectionReason);
  };

  return (
    <div className="flex gap-2">
      <button
        onClick={handleApprove}
        disabled={loading}
        className="bg-brand text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
      >
        موافقة
      </button>
      <button
        onClick={handleReject}
        disabled={loading}
        className="border-[1.5px] border-red-600 text-red-700 text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
      >
        رفض
      </button>
    </div>
  );
}
