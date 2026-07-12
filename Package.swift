// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "TideEngine",
    platforms: [.macOS(.v13), .iOS(.v16)],
    products: [
        .library(name: "TideEngine", targets: ["TideEngine"])
    ],
    targets: [
        .target(
            name: "TideEngine",
            resources: [.process("Resources")]
        ),
        // Golden-vector checker. This toolchain (Command Line Tools) ships no XCTest,
        // so verification runs as an assert-based executable: `swift run tide-check`.
        // ponytail: an executable self-check, not a test framework — works anywhere,
        // upgrade to swift-testing if a full Xcode toolchain is ever the target.
        .executableTarget(
            name: "tide-check",
            dependencies: ["TideEngine"],
            resources: [.process("Fixtures")]
        )
    ]
)
