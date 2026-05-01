import {
  Compass,
  ShieldCheck,
  type LucideProps,
} from 'lucide-react-native';

export function CoachFeatureIcon({
  strokeWidth = 2.3,
  ...props
}: LucideProps) {
  return <Compass {...props} strokeWidth={strokeWidth} />;
}

export function SuperScanFeatureIcon({
  strokeWidth = 2.4,
  ...props
}: LucideProps) {
  return <ShieldCheck {...props} strokeWidth={strokeWidth} />;
}
