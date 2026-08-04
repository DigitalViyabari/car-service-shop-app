import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Picker } from "@react-native-picker/picker";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colours } from "../lib/theme";

export type SelectOption = { label: string; value: string };

export function SelectField({
  label,
  value,
  options,
  onChange,
  enabled = true,
}: {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  enabled?: boolean;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.select, !enabled && styles.disabled]}>
        <Picker
          selectedValue={value}
          onValueChange={(next) => onChange(String(next))}
          enabled={enabled}
          style={styles.picker}
          dropdownIconColor={colours.ink}
          mode="dropdown"
        >
          {options.map((option) => (
            <Picker.Item key={option.value} label={option.label} value={option.value} />
          ))}
        </Picker>
      </View>
    </View>
  );
}

function validDate(value: string, includeTime: boolean) {
  const parsed = value ? new Date(includeTime ? value : `${value}T12:00:00`) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function dateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateTimeValue(date: Date) {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${dateValue(date)}T${hours}:${minutes}`;
}

export function DateField({
  label,
  value,
  onChange,
  includeTime = false,
  optional = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  includeTime?: boolean;
  optional?: boolean;
}) {
  const [mode, setMode] = useState<"date" | "time" | "datetime" | null>(null);
  const selected = validDate(value, includeTime);
  const display = value
    ? selected.toLocaleString(
        "en-IN",
        includeTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" },
      )
    : optional
      ? "Select date"
      : "Choose date";

  function changed(event: DateTimePickerEvent, next?: Date) {
    if (event.type === "dismissed" || !next) {
      setMode(null);
      return;
    }
    if (includeTime && mode === "date" && Platform.OS === "android") {
      const combined = new Date(next);
      combined.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
      onChange(dateTimeValue(combined));
      setMode("time");
      return;
    }
    onChange(includeTime ? dateTimeValue(next) : dateValue(next));
    setMode(null);
  }

  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.dateRow}>
        <TouchableOpacity
          style={styles.dateButton}
          onPress={() => setMode(includeTime && Platform.OS === "ios" ? "datetime" : "date")}
        >
          <Text style={[styles.dateText, !value && styles.placeholder]}>{display}</Text>
          <Ionicons
            name={includeTime ? "calendar" : "calendar-outline"}
            size={22}
            color={colours.navy}
          />
        </TouchableOpacity>
        {optional && value ? (
          <TouchableOpacity
            style={styles.clear}
            onPress={() => onChange("")}
            accessibilityLabel={`Clear ${label}`}
          >
            <Ionicons name="close" size={22} color={colours.red} />
          </TouchableOpacity>
        ) : null}
      </View>
      {mode ? (
        <DateTimePicker
          value={selected}
          mode={mode}
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={changed}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fieldGroup: { marginTop: 14 },
  label: { fontSize: 15, fontWeight: "800", color: colours.ink, marginBottom: 6 },
  select: {
    minHeight: 56,
    borderWidth: 1.5,
    borderColor: colours.line,
    borderRadius: 14,
    backgroundColor: colours.card,
    overflow: "hidden",
    justifyContent: "center",
  },
  picker: { color: colours.ink },
  disabled: { opacity: 0.5, backgroundColor: "#EDF0F3" },
  dateRow: { flexDirection: "row", gap: 8 },
  dateButton: {
    minHeight: 56,
    flex: 1,
    borderWidth: 1.5,
    borderColor: colours.line,
    borderRadius: 14,
    backgroundColor: colours.card,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dateText: { color: colours.ink, fontSize: 16, fontWeight: "700" },
  placeholder: { color: colours.muted, fontWeight: "500" },
  clear: {
    width: 54,
    borderRadius: 14,
    backgroundColor: "#FDEBEC",
    alignItems: "center",
    justifyContent: "center",
  },
});
