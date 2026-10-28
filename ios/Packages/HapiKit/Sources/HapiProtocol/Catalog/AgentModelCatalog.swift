import Foundation

/// Model and effort option builders for the dynamically discovered agents —
/// ports of the web builders (`NewSession/grokModels.ts`,
/// `AssistantChat/modelOptions.ts`, `piThinkingLevelOptions.ts`,
/// `cursorCliSku.ts`). Claude and Codex keep their own catalogs.
///
/// New-session rows use the `'auto'` / `'default'` sentinels of
/// ``NewSessionOption``; session rows use ``CatalogOption`` with `nil` for
/// "clear to the agent default".
public enum AgentModelCatalog {
    public enum Scope: Equatable, Sendable {
        /// One catalog per machine.
        case machine
        /// Probed in the target directory: needs an existing `cwd`.
        case directory
    }

    /// Nil for flavors without a discovered catalog (claude, codex, gemini).
    public static func scope(for flavor: AgentFlavor) -> Scope? {
        switch flavor {
        case .agy, .cursor, .dsh, .pi: return .machine
        case .copilot, .grok, .kimi, .opencode: return .directory
        default: return nil
        }
    }

    // MARK: - Model rows

    /// The value a picker stores for a row. Pi spawns as `provider/modelId`.
    public static func modelValue(_ model: AgentModelSummary, flavor: AgentFlavor) -> String {
        flavor == .pi ? "\(model.provider ?? "unknown")/\(model.modelId)" : model.modelId
    }

    public static func modelLabel(_ model: AgentModelSummary, flavor: AgentFlavor) -> String {
        let name = model.name ?? model.modelId
        switch flavor {
        case .kimi, .pi:
            guard let provider = model.provider, !provider.isEmpty else { return name }
            return "\(provider) — \(name)"
        default:
            return name
        }
    }

    /// Catalog rows a picker lists: cursor keeps ACP model ids only, copilot
    /// drops its own `auto` row (the picker supplies one); duplicates collapse.
    public static func listedModels(_ response: AgentModelsResponse, flavor: AgentFlavor) -> [AgentModelSummary] {
        var seen = Set<String>()
        return (response.availableModels ?? []).filter { model in
            switch flavor {
            case .cursor:
                guard isCursorCatalogModelId(model.modelId) else { return false }
            case .copilot:
                guard model.modelId != "auto" else { return false }
            default:
                break
            }
            return seen.insert(modelValue(model, flavor: flavor)).inserted
        }
    }

    /// The row a picker value refers to (`'auto'` → none).
    public static func selectedModel(
        _ response: AgentModelsResponse?,
        flavor: AgentFlavor,
        value: String?
    ) -> AgentModelSummary? {
        guard let response, let value, value != "auto" else { return nil }
        return listedModels(response, flavor: flavor).first { modelValue($0, flavor: flavor) == value }
    }

    // MARK: - New session

    /// Model rows for the create form: a Default (`auto`) row, labelled
    /// "Auto" for copilot and cursor, then the catalog. OpenCode marks the
    /// agent's own default.
    public static func newSessionModelOptions(
        flavor: AgentFlavor,
        response: AgentModelsResponse
    ) -> [NewSessionOption] {
        let auto = NewSessionOption(
            value: "auto",
            label: flavor == .copilot || flavor == .cursor ? "Auto" : "Default"
        )
        return [auto] + listedModels(response, flavor: flavor).map { model in
            var label = modelLabel(model, flavor: flavor)
            if flavor == .opencode, model.modelId == response.currentModelId {
                label += " (default)"
            }
            return NewSessionOption(value: modelValue(model, flavor: flavor), label: label)
        }
    }

    /// Grok launch effort (`buildGrokEffortOptions`): the efforts of the
    /// selected model (or the agent's default on `auto`); static levels
    /// while unknown.
    public static func grokEffortOptions(response: AgentModelsResponse?, model: String) -> [NewSessionOption] {
        let effective = model == "auto" ? response?.currentModelId : model
        let efforts = response?.availableModels?.first { $0.modelId == effective }?.reasoningEfforts ?? []
        guard !efforts.isEmpty else {
            return [
                NewSessionOption(value: "auto", label: "Default"),
                NewSessionOption(value: "low", label: "Low"),
                NewSessionOption(value: "medium", label: "Medium"),
                NewSessionOption(value: "high", label: "High"),
            ]
        }
        return [NewSessionOption(value: "auto", label: "Default")]
            + efforts.map { NewSessionOption(value: $0.value, label: $0.name ?? $0.value) }
    }

    /// Pi launch thinking level; nil hides it for a non-reasoning model.
    public static func piEffortOptions(response: AgentModelsResponse?, model: String) -> [NewSessionOption]? {
        let selected = selectedModel(response, flavor: .pi, value: model)
        guard selected?.reasoning != false else { return nil }
        return [NewSessionOption(value: "auto", label: "Default")]
            + piThinkingLevels(map: selected?.thinkingLevelMap).map {
                NewSessionOption(value: $0, label: piThinkingLevelLabel($0))
            }
    }

    /// OpenCode launch reasoning effort ("variant") of the selected model, or
    /// of the agent's default on `auto`. Static levels while the variants
    /// are unknown; nil hides the field when the model has none.
    public static func opencodeReasoningEffortOptions(
        variants: [String: [String]]?,
        response: AgentModelsResponse?,
        model: String
    ) -> [NewSessionOption]? {
        let effective = model == "auto" ? response?.currentModelId : model
        guard let effective, let list = variants?[effective] else {
            return [
                NewSessionOption(value: "default", label: "Default"),
                NewSessionOption(value: "low", label: "Low"),
                NewSessionOption(value: "medium", label: "Medium"),
                NewSessionOption(value: "high", label: "High"),
                NewSessionOption(value: "max", label: "Max"),
            ]
        }
        guard !list.isEmpty else { return nil }
        return [NewSessionOption(value: "default", label: "Default")]
            + list.map { NewSessionOption(value: $0, label: $0) }
    }

    // MARK: - Pi thinking levels (`shared/src/piThinkingLevel.ts`)

    public static let piThinkingLevelOrder = ["off", "minimal", "low", "medium", "high", "xhigh", "max"]

    /// `xhigh`/`max` need an explicit map entry; a level mapped to `null`
    /// is unsupported; anything else absent from the map is supported.
    public static func isPiThinkingLevelSupported(_ level: String, map: [String: String?]?) -> Bool {
        let entry = map?[level]
        if level == "xhigh" || level == "max" {
            guard let entry else { return false }
            return entry != nil
        }
        guard let entry else { return true }
        return entry != nil
    }

    public static func piThinkingLevels(map: [String: String?]?) -> [String] {
        piThinkingLevelOrder.filter { isPiThinkingLevelSupported($0, map: map) }
    }

    public static func piThinkingLevelLabel(_ level: String) -> String {
        level == "xhigh" ? "XHigh" : ModelCatalog.capitalizedFirst(level)
    }

    // MARK: - Cursor (`shared/src/cursorCliSku.ts`)

    private static let cursorCliSkuSuffixes = [
        "-extra-high-fast", "-extra-high", "-xhigh-fast", "-xhigh", "-high-fast", "-high",
        "-medium-fast", "-medium", "-low-fast", "-low", "-none-fast", "-none",
        "-thinking-high-fast", "-thinking-high", "-thinking", "-fast",
    ]

    /// `isCursorAcpCatalogModelId`: ACP wire ids (`base[params]`) and bare
    /// bases; rejects `auto`/`default` and CLI effort/speed SKU slugs.
    public static func isCursorCatalogModelId(_ modelId: String) -> Bool {
        let trimmed = modelId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return false }
        let lower = trimmed.lowercased()
        if lower == "auto" || lower == "default" { return false }
        if trimmed == "default[]" || trimmed.contains("[") { return true }
        return cursorCliSkuBaseId(trimmed) == trimmed
    }

    private static func cursorCliSkuBaseId(_ slug: String) -> String {
        var base = slug
        var changed = true
        while changed {
            changed = false
            for suffix in cursorCliSkuSuffixes where base.hasSuffix(suffix) {
                base.removeLast(suffix.count)
                changed = true
                break
            }
        }
        return base
    }
}
