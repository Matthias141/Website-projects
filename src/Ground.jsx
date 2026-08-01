// Same trick as the vanilla build: shadowMaterial renders fully transparent
// except where a shadow actually falls — an invisible floor that still
// grounds the sculpture with a contact shadow, no visible plane geometry.
export default function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -3.4, 0]} receiveShadow>
      <circleGeometry args={[14, 64]} />
      <shadowMaterial opacity={0.28} />
    </mesh>
  );
}
