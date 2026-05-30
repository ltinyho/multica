import { useEffect, useState } from "react";
import {
  ActionSheetIOS,
  Modal,
  Platform,
  Pressable,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

interface ActionSheetOptions {
  options: string[];
  cancelButtonIndex?: number;
  destructiveButtonIndex?: number;
  title?: string;
  message?: string;
}

interface ActionSheetState {
  options: ActionSheetOptions;
  callback: (buttonIndex: number) => void;
}

let listener: ((state: ActionSheetState) => void) | null = null;

export function showActionSheetWithOptions(
  options: ActionSheetOptions,
  callback: (buttonIndex: number) => void,
) {
  if (Platform.OS === "ios") {
    ActionSheetIOS.showActionSheetWithOptions(options, callback);
    return;
  }
  listener?.({ options, callback });
}

export function ActionSheetHost() {
  const [state, setState] = useState<ActionSheetState | null>(null);

  useEffect(() => {
    listener = setState;
    return () => {
      listener = null;
    };
  }, []);

  const close = (index: number) => {
    const current = state;
    setState(null);
    current?.callback(index);
  };

  const opts = state?.options;
  const cancelIndex = opts?.cancelButtonIndex ?? -1;

  return (
    <Modal
      visible={!!state}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (cancelIndex >= 0) close(cancelIndex);
        else setState(null);
      }}
    >
      <Pressable
        className="flex-1 justify-end bg-black/35"
        onPress={() => {
          if (cancelIndex >= 0) close(cancelIndex);
          else setState(null);
        }}
      >
        <SafeAreaView edges={["bottom"]} className="px-3 pb-2">
          <Pressable className="overflow-hidden rounded-xl bg-popover">
            {opts?.title ? (
              <View className="border-b border-border px-4 py-3">
                <Text className="text-center text-sm font-medium text-popover-foreground">
                  {opts.title}
                </Text>
                {opts.message ? (
                  <Text className="mt-1 text-center text-xs text-muted-foreground">
                    {opts.message}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {opts?.options.map((label, index) => {
              const isCancel = index === opts.cancelButtonIndex;
              const isDestructive = index === opts.destructiveButtonIndex;
              return (
                <Pressable
                  key={`${label}-${index}`}
                  className={cn(
                    "min-h-12 items-center justify-center border-b border-border px-4 active:bg-accent",
                    index === opts.options.length - 1 && "border-b-0",
                  )}
                  onPress={() => close(index)}
                >
                  <Text
                    className={cn(
                      "text-base",
                      isCancel && "font-medium",
                      isDestructive ? "text-destructive" : "text-foreground",
                    )}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </Pressable>
        </SafeAreaView>
      </Pressable>
    </Modal>
  );
}
