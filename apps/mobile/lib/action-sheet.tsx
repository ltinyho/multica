import { useEffect, useState, type ComponentProps } from "react";
import {
  ActionSheetIOS,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/components/ui/text";
import { useTheme } from "@react-navigation/native";
import { THEME } from "@/lib/theme";

export interface ActionSheetItem {
  label: string;
  icon?: ComponentProps<typeof Ionicons>["name"];
}

interface ActionSheetOptions {
  options: (string | ActionSheetItem)[];
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
    // iOS native ActionSheet only supports string options
    const stringOptions = options.options.map((o) =>
      typeof o === "string" ? o : o.label,
    );
    ActionSheetIOS.showActionSheetWithOptions(
      { ...options, options: stringOptions },
      callback,
    );
    return;
  }
  listener?.({ options, callback });
}

function resolveLabel(item: string | ActionSheetItem): string {
  return typeof item === "string" ? item : item.label;
}

function resolveIcon(
  item: string | ActionSheetItem,
): ComponentProps<typeof Ionicons>["name"] | undefined {
  return typeof item === "string" ? undefined : item.icon;
}

export function ActionSheetHost() {
  const [state, setState] = useState<ActionSheetState | null>(null);
  const { dark } = useTheme();

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

  // Separate the cancel button from the action items (iOS-style)
  const actionItems =
    opts?.options
      .map((item, index) => ({ item, index }))
      .filter(({ index }) => index !== cancelIndex) ?? [];

  const cancelItem =
    cancelIndex >= 0 && opts?.options[cancelIndex]
      ? opts.options[cancelIndex]
      : null;

  const destructiveIndex = opts?.destructiveButtonIndex ?? -1;

  const colors = dark ? THEME.dark : THEME.light;
  const styles = makeStyles(colors);

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
        style={styles.overlay}
        onPress={() => {
          if (cancelIndex >= 0) close(cancelIndex);
          else setState(null);
        }}
      >
        <SafeAreaView edges={["bottom"]} style={styles.safeArea}>
          {/* Action group */}
          <View style={styles.group}>
            {opts?.title || opts?.message ? (
              <View style={styles.header}>
                {opts.title ? (
                  <Text
                    style={styles.titleText}
                  >
                    {opts.title}
                  </Text>
                ) : null}
                {opts.message ? (
                  <Text
                    style={styles.messageText}
                  >
                    {opts.message}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {actionItems.map(({ item, index }, arrIndex) => {
              const label = resolveLabel(item);
              const icon = resolveIcon(item);
              const isDestructive = index === destructiveIndex;
              const isFirst = arrIndex === 0;

              return (
                <Pressable
                  key={`${label}-${index}`}
                  style={[
                    styles.item,
                    !isFirst && styles.itemBorder,
                  ]}
                  onPress={() => close(index)}
                >
                  {icon ? (
                    <Ionicons
                      name={icon}
                      size={22}
                      color={
                        isDestructive
                          ? "#EF4444"
                          : colors.foreground
                      }
                      style={styles.itemIcon}
                    />
                  ) : null}
                  <Text
                    style={[
                      styles.itemText,
                      isDestructive && styles.destructiveText,
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Cancel button — separate group */}
          {cancelItem ? (
            <View style={styles.cancelGroup}>
              <Pressable
                style={styles.cancelItem}
                onPress={() => close(cancelIndex)}
              >
                <Text style={styles.cancelText}>
                  {resolveLabel(cancelItem)}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </SafeAreaView>
      </Pressable>
    </Modal>
  );
}

function makeStyles(colors: (typeof THEME)["light"]) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: "rgba(0, 0, 0, 0.4)",
    },
    safeArea: {
      paddingHorizontal: 8,
      paddingBottom: 8,
    },
    group: {
      borderRadius: 14,
      overflow: "hidden",
      backgroundColor: colors.card,
    },
    header: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    titleText: {
      textAlign: "center",
      fontSize: 14,
      fontWeight: "600",
      color: colors.foreground,
    },
    messageText: {
      marginTop: 4,
      textAlign: "center",
      fontSize: 12,
      color: colors.mutedForeground,
    },
    item: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      minHeight: 56,
    },
    itemBorder: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    itemIcon: {
      marginRight: 12,
    },
    itemText: {
      fontSize: 17,
      color: colors.foreground,
    },
    destructiveText: {
      color: "#EF4444",
    },
    cancelGroup: {
      marginTop: 8,
      borderRadius: 14,
      overflow: "hidden",
      backgroundColor: colors.card,
    },
    cancelItem: {
      alignItems: "center",
      justifyContent: "center",
      minHeight: 56,
    },
    cancelText: {
      fontSize: 17,
      fontWeight: "600",
      color: "#3B82F6",
    },
  });
}
