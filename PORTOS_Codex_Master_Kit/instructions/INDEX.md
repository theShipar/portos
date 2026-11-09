# PORTOS Implementation Specification Index

Every instruction is normative. Implement module order top-to-bottom unless a file explicitly defines a prerequisite.

| Module | Files | Responsibility |
|---|---:|---|
| `01-product` | 5 | 01 Product |
| `02-design-system` | 6 | 02 Design System |
| `03-earth-and-map` | 7 | 03 Earth And Map |
| `04-maritime-3d` | 7 | 04 Maritime 3D |
| `05-map-interactions` | 5 | 05 Map Interactions |
| `06-intelligence` | 6 | 06 Intelligence |
| `07-screens` | 6 | 07 Screens |
| `08-data-simulation` | 5 | 08 Data Simulation |
| `09-workflows` | 4 | 09 Workflows |
| `10-testing` | 4 | 10 Testing |

## Complete 55-file checklist

### 01-product
- [ ] [01_product_vision](./01-product/01_product_vision.md) — Make PORTOS a decision-oriented maritime exception-management product, not a vessel-tracking decoration.
- [ ] [02_personas_jobs_to_be_done](./01-product/02_personas_jobs_to_be_done.md) — Define who pays for and operates PORTOS, separating decision authority from day-to-day analysis.
- [ ] [03_information_architecture](./01-product/03_information_architecture.md) — Establish a map-first navigation taxonomy with deep links and persistent geographic context.
- [ ] [04_end_to_end_user_journeys](./01-product/04_end_to_end_user_journeys.md) — Specify actionable workflows that can be demonstrated end to end using coherent sample data.
- [ ] [05_app_architecture](./01-product/05_app_architecture.md) — Choose a coherent Vue/Three application architecture and module dependency boundaries.

### 02-design-system
- [ ] [01_visual_direction](./02-design-system/01_visual_direction.md) — Deliver a credible serious industrial maritime interface rather than glossy game HUD or consumer concept art.
- [ ] [02_color_and_semantic_tokens](./02-design-system/02_color_and_semantic_tokens.md) — Specify an accessible white-orange technical palette where accent and status have different jobs.
- [ ] [03_typography_and_data_readability](./02-design-system/03_typography_and_data_readability.md) — Create an enterprise data typography system that makes technical numbers trustworthy and scannable.
- [ ] [04_layout_grid_spacing](./02-design-system/04_layout_grid_spacing.md) — Define precise desktop geometry, responsive rules and harmonious padding rather than visual guesswork.
- [ ] [05_components_states_accessibility](./02-design-system/05_components_states_accessibility.md) — List reusable UI primitives and behavior across loading, error, disabled, hover, focus and selected states.
- [ ] [06_motion_and_microinteractions](./02-design-system/06_motion_and_microinteractions.md) — Set intentional animation to help map continuity without sacrificing operational clarity.

### 03-earth-and-map
- [ ] [01_original_skill_integration](./03-earth-and-map/01_original_skill_integration.md) — Integrate the exact original Three Scope Map as a controlled geographic base without assuming it already supports maritime data.
- [ ] [02_earth_renderer](./03-earth-and-map/02_earth_renderer.md) — Preserve a realistic spherical world and render spatially truthful vessel/port/route context.
- [ ] [03_geographic_region_drilldown](./03-earth-and-map/03_geographic_region_drilldown.md) — Provide meaningful Earth->maritime-region->port navigation with explicit geometry and bound selection.
- [ ] [04_camera_flight_and_preset_system](./03-earth-and-map/04_camera_flight_and_preset_system.md) — Implement polished camera transitions that respect positions and avoid unnecessary cinematic delay.
- [ ] [05_ocean_coastlines_lighting](./03-earth-and-map/05_ocean_coastlines_lighting.md) — Define credible maritime cartography and lighting without fabricating navigational charts.
- [ ] [06_spatial_coordinate_system](./03-earth-and-map/06_spatial_coordinate_system.md) — Standardize geographic placement for globe, regional meshes, port map and replay.
- [ ] [07_rendering_performance_quality](./03-earth-and-map/07_rendering_performance_quality.md) — Keep maritime globe responsive with hundreds of entities and smooth transitions on normal hardware.

### 04-maritime-3d
- [ ] [01_vessel_mesh_geometry](./04-maritime-3d/01_vessel_mesh_geometry.md) — Build believable low-poly-to-detailed maritime vessel geometry with consistent anchors and scale.
- [ ] [02_vessel_models_lod_materials](./04-maritime-3d/02_vessel_models_lod_materials.md) — Control ship-level detail, loading and GPU cost without sacrificing realistic cues.
- [ ] [03_vessel_motion_and_heading](./04-maritime-3d/03_vessel_motion_and_heading.md) — Animate vessel state from timestamped positions without inventing continuous real-time telemetry.
- [ ] [04_ports_terminals_and_berths](./04-maritime-3d/04_ports_terminals_and_berths.md) — Translate real geographic port concepts into inspectable, correctly scoped entities.
- [ ] [05_anchorage_and_queue_visuals](./04-maritime-3d/05_anchorage_and_queue_visuals.md) — Represent congestion without misrepresenting queue rank or making invented navigation claims.
- [ ] [06_sea_routes_flylines](./04-maritime-3d/06_sea_routes_flylines.md) — Render accurate-looking maritime corridors with real operational meaning and selected path intelligence.
- [ ] [07_weather_hazard_overlays](./04-maritime-3d/07_weather_hazard_overlays.md) — Use weather overlays only as grounded operational context with clear timing and uncertainty.

### 05-map-interactions
- [ ] [01_selection_and_hover](./05-map-interactions/01_selection_and_hover.md) — Make every map element an accessible, grounded entry to a concrete operational entity.
- [ ] [02_layer_management](./05-map-interactions/02_layer_management.md) — Create a small controlled cartographic layer system, not a collection of overlapping dashboard toggles.
- [ ] [03_global_search_and_filters](./05-map-interactions/03_global_search_and_filters.md) — Make findability fast for busy operators and avoid disorienting map navigation.
- [ ] [04_3d_2d_view_switch](./05-map-interactions/04_3d_2d_view_switch.md) — Use 3D where it explains context and 2D where it improves maritime spatial accuracy.
- [ ] [05_replay_and_time_navigation](./05-map-interactions/05_replay_and_time_navigation.md) — Build a deterministic temporal inspection workflow for voyage positions and port exceptions.

### 06-intelligence
- [ ] [01_voyage_eta_engine](./06-intelligence/01_voyage_eta_engine.md) — Explain ETA changes from recorded estimates rather than inventing navigationally precise arrival predictions.
- [ ] [02_port_congestion_engine](./06-intelligence/02_port_congestion_engine.md) — Use defensible congestion metrics grounded in observed/simulated port events.
- [ ] [03_delay_exposure_calculator](./06-intelligence/03_delay_exposure_calculator.md) — Translate operational time loss into transparent and bounded monetary exposure estimates.
- [ ] [04_weather_route_risk_engine](./06-intelligence/04_weather_route_risk_engine.md) — Compute explainable spatial risk from time-bounded hazard polygons and voyage paths.
- [ ] [05_analytics_kpi_contracts](./06-intelligence/05_analytics_kpi_contracts.md) — Define every displayed maritime KPI mathematically and tie it to one source selector.
- [ ] [06_provenance_uncertainty_alerts](./06-intelligence/06_provenance_uncertainty_alerts.md) — Make every operational recommendation auditable and distinguish modeled data from observed facts.

### 07-screens
- [ ] [01_global_fleet_screen](./07-screens/01_global_fleet_screen.md) — Define the visually distinctive but operationally useful first view, with Earth as the primary canvas.
- [ ] [02_regional_maritime_screen](./07-screens/02_regional_maritime_screen.md) — Use original skill-inspired regional geography to explore real operational density and route interactions.
- [ ] [03_port_operations_screen](./07-screens/03_port_operations_screen.md) — Make port detail a functional queue and terminal operations workspace with map-first prioritization.
- [ ] [04_vessel_voyage_screen](./07-screens/04_vessel_voyage_screen.md) — Create a single entity investigation panel that places evidence beside a geographically meaningful route.
- [ ] [05_incident_investigation_screen](./07-screens/05_incident_investigation_screen.md) — Give operators a practical evidence-led case workflow embedded into map context.
- [ ] [06_route_comparison_replay_screen](./07-screens/06_route_comparison_replay_screen.md) — Make uncertainty-aware decision comparison and temporal replay central showcase features.

### 08-data-simulation
- [ ] [01_json_entity_relationships](./08-data-simulation/01_json_entity_relationships.md) — Establish validated, linked JSON sources that support every visible entity and calculation.
- [ ] [02_demo_dataset_generation](./08-data-simulation/02_demo_dataset_generation.md) — Create a substantial but coherent synthetic world of maritime operations for full UI behavior.
- [ ] [03_deterministic_simulation_clock](./08-data-simulation/03_deterministic_simulation_clock.md) — Make an offline prototype feel alive without pretending to use live operational feeds.
- [ ] [04_events_and_replay_data](./08-data-simulation/04_events_and_replay_data.md) — Define event sourcing and history sufficient to explain why a visible state changed.
- [ ] [05_client_state_and_persistence](./08-data-simulation/05_client_state_and_persistence.md) — Persist prototype UI/workflows safely while keeping seed data immutable and testable.

### 09-workflows
- [ ] [01_alert_triage_and_case_lifecycle](./09-workflows/01_alert_triage_and_case_lifecycle.md) — Implement a complete maritime exception queue, not decorative risk chips.
- [ ] [02_operational_alternative_comparison](./09-workflows/02_operational_alternative_comparison.md) — Support defensible maritime response decisions without implying navigational authority.
- [ ] [03_action_assignment_notifications](./09-workflows/03_action_assignment_notifications.md) — Make assignments and communication workflows tangible but safely sandboxed.
- [ ] [04_audit_trail_and_handoffs](./09-workflows/04_audit_trail_and_handoffs.md) — Track who decided what, on what evidence, and whether a handoff was completed.

### 10-testing
- [ ] [01_acceptance_and_e2e_matrix](./10-testing/01_acceptance_and_e2e_matrix.md) — Define measurable journey and data correctness gates for an authentic working prototype.
- [ ] [02_visual_regression_accessibility](./10-testing/02_visual_regression_accessibility.md) — Ensure consistency and serious professional quality across all spatial states.
- [ ] [03_performance_and_resilience](./10-testing/03_performance_and_resilience.md) — Make the product responsive under realistic simulated volume and degraded data conditions.
- [ ] [04_codex_execution_and_release](./10-testing/04_codex_execution_and_release.md) — Make the instruction pack a reliable staged implementation contract rather than one huge ambiguous request.
