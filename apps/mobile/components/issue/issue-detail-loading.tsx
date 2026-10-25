/**
 * Loading skeleton for the issue detail screen. Only shown on a cold open
 * (deep link / notification) — row taps from a list render the cached
 * issue immediately via `findCachedIssue` placeholder data. Mirrors the
 * `IssueHeaderCard` shape (identifier, title, attribute chips) followed by
 * a few description / timeline bands so the layout doesn't jump when the
 * real content lands.
 */
import { View } from "react-native";
import { Skeleton } from "@/components/ui/skeleton";

export function IssueDetailLoading() {
  return (
    <View className="flex-1 bg-background">
      <View className="px-4 pt-4 pb-3 gap-3">
        <Skeleton className="h-3 w-16" />
        <View className="gap-2">
          <Skeleton className="h-6 w-11/12" />
          <Skeleton className="h-6 w-1/2" />
        </View>
        <View className="flex-row flex-wrap gap-2">
          {[20, 16, 24, 18].map((w, i) => (
            <Skeleton
              key={i}
              className="h-7 rounded-full"
              style={{ width: w * 4 }}
            />
          ))}
        </View>
      </View>
      <View className="px-4 pt-2 gap-2.5">
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-3/4" />
      </View>
      <View className="px-4 pt-8 gap-5">
        {Array.from({ length: 3 }).map((_, i) => (
          <View key={i} className="flex-row gap-3">
            <Skeleton className="size-7 rounded-full" />
            <View className="flex-1 gap-2">
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-2/3" />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
