import { Card, CardContent } from "@/components/ui/card";
import { Eye } from "lucide-react";

export default function Watchlist() {
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Watchlist</h1>
      <Card>
        <CardContent className="flex flex-col items-center py-12 text-center">
          <Eye className="mb-4 h-10 w-10 text-muted-foreground" />
          <p className="text-lg font-medium">Coming Soon</p>
          <p className="text-sm text-muted-foreground">
            Track symbols you're interested in but don't own yet.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
