import Marp from '@marp-team/marp-core'

/**
 * Gère le cycle de vie des thèmes CSS Marp : chargement, hot-reload et fourniture
 * d'une instance Marp prête à l'emploi.
 *
 * ## Pourquoi ce cache d'instance ?
 *
 * Une instance Marp Core est immuable une fois construite : il est impossible d'y
 * ajouter des thèmes après coup. La seule façon de "changer" les thèmes actifs est
 * de reconstruire l'instance de zéro. `cachedMarp` matérialise ce contrat : dès qu'un
 * thème change (chargement initial ou hot-reload), le cache est invalidé, et la prochaine
 * demande de rendu déclenche une reconstruction transparente.
 *
 * ## Injection de dépendances
 *
 * `readFile` et `onFileChange` sont passés en paramètres plutôt qu'accédés directement
 * via l'API Obsidian. Cela permet de tester `Themes` en isolation avec des stubs simples,
 * sans monter un environnement Obsidian complet.
 *
 * ## Pourquoi setOnUpdate() est un setter et non un paramètre du constructeur ?
 *
 * `loadThemes()` dans `main.ts` appelle toujours `dispose()` puis `setOnUpdate()`
 * en séquence, y compris lors des rechargements de settings. Ce pattern garantit
 * que l'état de `Themes` est entièrement reconfigurable depuis `main.ts` après
 * chaque cycle dispose/reload, sans dépendre de l'état antérieur.
 * Note : `dispose()` ne remet pas `onUpdate` à `null` — le setter est rappelé
 * par convention, pas par obligation. Le callback lui-même ne capture pas
 * d'instance de `MarpPreviewView` : il interroge le workspace au moment de l'appel
 * via `getActiveViewOfType()`, ce qui le rend valide tout au long du cycle de vie.
 */
export class Themes {
  /** Contenu CSS brut de chaque thème, indexé par chemin absolu. */
  private cssCache = new Map<string, string>()

  /**
   * Fonctions de nettoyage retournées par `onFileChange`.
   * Chaque entrée correspond à un watcher actif sur un fichier thème.
   * Elles sont appelées dans `dispose()` pour libérer les ressources.
   */
  private cleanups = new Map<string, () => void>()

  /**
   * Callback déclenché après chaque hot-reload d'un thème.
   * Branché depuis `main.ts` via `setOnUpdate()` pour provoquer un re-render
   * de la preview sans que `Themes` ait besoin de connaître `MarpPreviewView`.
   */
  private onUpdate: (() => void) | null = null

  /**
   * Instance Marp partagée entre tous les rendus.
   * `null` signifie que le cache est invalidé : la prochaine demande via
   * `getMarpInstance()` déclenchera une reconstruction avec les thèmes courants.
   */
  private cachedMarp: Marp | null = null

  /**
   * @param readFile     Lit le contenu d'un fichier CSS depuis le système de fichiers.
   *                     Abstrait pour rendre `Themes` testable sans l'API Obsidian.
   * @param onFileChange Enregistre un watcher sur un fichier et retourne une fonction
   *                     de désinscription. Abstrait pour la même raison que `readFile`.
   */
  constructor(
    private readFile: (path: string) => Promise<string>,
    private onFileChange: (path: string, cb: () => void) => () => void
  ) {}

  /**
   * Branche le callback de re-render appelé après chaque hot-reload de thème.
   * Voir la section "Pourquoi setOnUpdate() est un setter" en tête de classe
   * pour le contexte architectural complet.
   */
  setOnUpdate(cb: () => void): void {
    this.onUpdate = cb
  }

  /**
   * Charge un thème CSS et active son hot-reload.
   *
   * Le CSS est lu une première fois et placé dans `cssCache`. Le cache Marp est
   * immédiatement invalidé car l'instance existante ignore ce nouveau thème.
   *
   * Un watcher est ensuite posé sur le fichier : toute modification ultérieure
   * recharge le CSS, invalide à nouveau le cache, puis déclenche `onUpdate` pour
   * que la preview se rafraîchisse sans action manuelle de l'utilisateur.
   *
   * Si `loadTheme` est appelé plusieurs fois sur le même chemin (ex. rechargement
   * des settings), l'entrée est simplement écrasée — pas de doublon.
   */
  async loadTheme(path: string): Promise<void> {
    const css = await this.readFile(path)
    this.cssCache.set(path, css)
    this.cachedMarp = null

    const cleanup = this.onFileChange(path, async () => {
      const updated = await this.readFile(path)
      this.cssCache.set(path, updated)
      this.cachedMarp = null
      this.onUpdate?.()
    })
    this.cleanups.set(path, cleanup)
  }

  /**
   * Retourne l'instance Marp active, en la reconstruisant si le cache est invalidé.
   *
   * La reconstruction est déclenchée par `cachedMarp === null`, état positionné à
   * chaque chargement ou hot-reload de thème. En dehors de ces événements, la même
   * instance est réutilisée pour tous les rendus — créer une nouvelle instance à
   * chaque appel serait coûteux et ignorerait les thèmes déjà enregistrés.
   *
   * `html: true` est délibéré : Marp doit honorer les balises HTML embarquées dans
   * les slides (directives, layouts custom, etc.). La surface d'attaque XSS est
   * contenue par le sandbox iframe dans `MarpPreviewView`, qui n'autorise que
   * `allow-scripts` sans `allow-same-origin`.
   *
   * Les thèmes CSS invalides sont ignorés silencieusement plutôt que de faire
   * échouer l'ensemble du rendu — un thème mal formé ne doit pas bloquer les slides.
   */
  getMarpInstance(): Marp {
    if (this.cachedMarp) return this.cachedMarp

    const marp = new Marp({ html: true })
    for (const css of this.cssCache.values()) {
      try {
        marp.themeSet.add(css)
      } catch {
        console.warn('[Marpidian] invalid CSS theme ignored')
      }
    }
    this.cachedMarp = marp
    return marp
  }

  /**
   * Libère toutes les ressources détenues par cette instance.
   *
   * Arrête les watchers de fichiers (via les fonctions de nettoyage stockées dans
   * `cleanups`), puis vide les caches CSS et Marp. À appeler impérativement dans
   * `onunload()` du plugin pour éviter les fuites mémoire et les watchers orphelins
   * qui continueraient à déclencher des re-renders après désactivation.
   */
  dispose(): void {
    this.cleanups.forEach((cleanup) => {
      cleanup()
    })
    this.cleanups.clear()
    this.cssCache.clear()
    this.cachedMarp = null
  }
}
