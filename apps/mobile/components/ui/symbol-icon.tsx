/**
 * Glyph that renders an SF Symbol on iOS and an Ionicons equivalent
 * everywhere else. expo-image's `sf:` source is iOS-only — on Android it
 * silently renders nothing, which left the More popover and the workspace
 * switcher with blank icon slots.
 *
 *   <SymbolIcon sf="pin" ionicon="pin-outline" size={18} color={t.foreground} />
 */
import type { ComponentProps } from "react";
import { Platform } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { Ionicons } from "@expo/vector-icons";

interface Props {
  /** SF Symbol name (iOS). */
  sf: string;
  /** Ionicons name (Android / web). */
  ionicon: ComponentProps<typeof Ionicons>["name"];
  size: number;
  color: string;
}

export function SymbolIcon({ sf, ionicon, size, color }: Props) {
  if (Platform.OS === "ios") {
    return (
      <ExpoImage
        source={`sf:${sf}`}
        tintColor={color}
        style={{ width: size, height: size }}
      />
    );
  }
  return <Ionicons name={ionicon} size={size} color={color} />;
}
