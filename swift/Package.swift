// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "CollinearFractals",
    products: [
        .library(name: "CollinearFractals", targets: ["CollinearFractals"])
    ],
    targets: [
        .target(name: "CollinearFractals"),
        .testTarget(name: "CollinearFractalsTests", dependencies: ["CollinearFractals"])
    ]
)
