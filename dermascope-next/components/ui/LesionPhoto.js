export default function LesionPhoto({ children, className = '', style }) {
  return (
    <div className={`relative overflow-hidden ${className}`} style={style}>
      <div className="lesion-photo" />
      <div className="dermoscope-vignette" />
      {children}
    </div>
  );
}
