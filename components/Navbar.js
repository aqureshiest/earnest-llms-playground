import Link from "next/link";

export const Navbar = ({}) => {
    return (
        <>
            <header className="shadow-md flex items-center justify-between px-4 py-3 bg-teal-700">
                <div className="flex items-center justify-between px-4 py-3">
                    <div>
                        <Link href="/" className="focus:outline-none">
                            <span className="px-2 text-2xl font-bold tracking-wide text-white">
                                Earnest LLM Playground
                            </span>
                        </Link>
                    </div>
                </div>
            </header>
        </>
    );
};
