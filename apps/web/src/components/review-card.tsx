// The weekly review's reminder on Today (D38): only in the review window (the end of the week and
// the next one's first day) and only until this week's review is done.

import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import { Streaky } from '@/components/streaky';
import { Button } from '@/components/ui/button';
import { reviewQuery } from '@/lib/queries';

export function ReviewCard() {
  const { data: r } = useQuery(reviewQuery);
  if (!r || !r.window || r.done) return null;
  return (
    <section
      aria-label="Weekly review"
      className="flex items-center gap-4 rounded-xl border bg-card p-4"
    >
      <Streaky mood="thinking" size={64} className="-my-2" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Time for your weekly review</p>
        <p className="text-sm text-muted-foreground">
          Five minutes to look back on the week and set up the next one. +50 XP, and today counts.
        </p>
      </div>
      <Button asChild>
        <Link to="/review">
          Start <ArrowRight />
        </Link>
      </Button>
    </section>
  );
}
