import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { colors } from '../theme/colors';

interface MenuCardProps {
  title: string;
  subtitle: string;
  IconComponent: React.ElementType;
  onPress: () => void;
  badge?: string;
  cardColor?: string;
}

export const MenuCard: React.FC<MenuCardProps> = ({
  title,
  subtitle,
  IconComponent,
  onPress,
  badge,
  cardColor = colors.emerald,
}) => {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={[styles.card, { backgroundColor: cardColor }]}
      onPress={onPress}
    >
      <View style={styles.leftSection}>
        <View style={styles.iconContainer}>
          <IconComponent size={24} color="#FFFFFF" strokeWidth={2.2} />
        </View>
        <View style={styles.textContainer}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{title}</Text>
            {badge && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{badge}</Text>
              </View>
            )}
          </View>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
      </View>
      <ChevronRight size={22} color="#FFFFFF" strokeWidth={2.5} style={styles.chevron} />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  textContainer: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.82)',
    fontSize: 13,
    marginTop: 2,
    fontWeight: '400',
  },
  badge: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    color: colors.emeraldDark,
    fontSize: 10,
    fontWeight: '700',
  },
  chevron: {
    opacity: 0.85,
    marginLeft: 8,
  },
});
