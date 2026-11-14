import styles from "./dognet-test-banner.module.css";

type DognetBannerFormat = "horizontal" | "vertical";

const AFFILIATE_URL =
  "https://go.dognet.com/?chid=PW4rE4bS&url=https%3A%2F%2Fwww.zoohit.sk%2F";

const BANNERS = {
  horizontal: {
    src: "https://visibility.postaffiliatepro.com/accounts/default1/banners/3a047bf8.gif",
    width: 468,
    height: 60,
  },
  vertical: {
    src: "https://visibility.postaffiliatepro.com/accounts/default1/banners/8cfd4fa0.gif",
    width: 120,
    height: 600,
  },
} as const;

/** Small, explicitly scoped Dognet/ZooHit trial. Existing D1 campaigns stay untouched. */
export function DognetTestBanner({ format }: { format: DognetBannerFormat }) {
  const creative = BANNERS[format];

  return (
    <aside
      className={`${styles.placement} ${format === "vertical" ? styles.vertical : styles.horizontal}`}
      aria-label="Reklama"
      data-dognet-test-banner={format}
    >
      <span className={styles.label}>Reklama · affiliate</span>
      <a
        className={styles.link}
        href={AFFILIATE_URL}
        target="_blank"
        rel="nofollow sponsored noopener noreferrer"
        aria-label="Reklama Zoohit.sk – otvoriť obchod v novej karte"
      >
        <img
          className={styles.image}
          src={creative.src}
          alt="Zoohit.sk – ponuka pre domácich miláčikov"
          width={creative.width}
          height={creative.height}
          loading="lazy"
          decoding="async"
        />
      </a>
    </aside>
  );
}
